/**
 * Kostenersatz Email Configuration and Template Rendering
 */

import nunjucks from 'nunjucks';
import { formatCurrency, KostenersatzCalculation } from './kostenersatz';
import { Firecall } from '../components/firebase/firestore';

// ============================================================================
// Types
// ============================================================================

export interface KostenersatzEmailConfig {
  fromEmail: string;
  ccEmail: string;
  subjectTemplate: string;
  bodyTemplate: string;
  updatedAt?: string;
  updatedBy?: string;
}

export interface EmailTemplateContext {
  recipient: {
    name: string;
    email: string;
    address: string;
    phone: string;
  };
  firecall: {
    name: string;
    date: string;
    description: string;
  };
  calculation: {
    totalSum: string;
    defaultStunden: number;
    comment: string;
  };
}

export interface SendEmailRequest {
  firecallId: string;
  calculationId: string;
  to: string;
  cc: string[];
  subject: string;
  body: string;
}

export interface SendEmailResponse {
  success: boolean;
  emailSentAt?: string;
  error?: string;
  details?: string;
}

// ============================================================================
// Constants
// ============================================================================

export const KOSTENERSATZ_CONFIG_COLLECTION = 'kostenersatzConfig';
export const KOSTENERSATZ_EMAIL_CONFIG_DOC = 'emailSettings';

// ============================================================================
// Default Templates
// ============================================================================

export const DEFAULT_EMAIL_CONFIG: KostenersatzEmailConfig = {
  fromEmail: 'no-reply@ff-neusiedlamsee.at',
  ccEmail: 'no-reply@ff-neusiedlamsee.at',
  subjectTemplate:
    'Kostenersatz - Feuerwehr Neusiedl am See - {{ firecall.date }}',
  bodyTemplate: `Sehr geehrte(r) {{ recipient.name }},

Anbei finden Sie die Abrechnung für den Kostenersatz zum Einsatz {{ firecall.name }} am {{ firecall.date }}.
Laut Landesgesetztblatt Nr. 77/2023 des Burgenlandes hat die Feuerwehr das Recht Kostenersatz zu fordern.

Sollte der Kostenersatz nicht vor Ort beglichen sein, bitte den Betrag auf folgendes Konto überweisen:

Freiwillige Feuerwehr Neusiedl am See
AT40 3300 0000 0202 0402
RLBBAT2E



Dear {{ recipient.name }},

Attached you will find the reimbursement for the emergency call {{ firecall.name }} on {{ firecall.date }}.
As by Austrian law (LgBl Nr. 77/2023 Burgenland) die fire departement has the right to request reimbursement.

If the payment didn't take place on the scene, please transfer the pending amount to the following bank account:

Freiwillige Feuerwehr Neusiedl am See
AT40 3300 0000 0202 0402
RLBBAT2E`,
};

// ============================================================================
// Template Rendering
// ============================================================================

// Configure nunjucks (no auto-escaping for plain text emails)
const nunjucksEnv = nunjucks.configure({ autoescape: false });

/**
 * Build template context from calculation and firecall data
 */
export function buildTemplateContext(
  calculation: KostenersatzCalculation,
  firecall: Firecall,
): EmailTemplateContext {
  // Format date as DD.MM.YYYY
  const dateStr = calculation.callDateOverride || firecall.date || '';
  let formattedDate = dateStr;
  if (dateStr) {
    try {
      const date = new Date(dateStr);
      if (!isNaN(date.getTime())) {
        formattedDate = date.toLocaleDateString('de-AT', {
          day: '2-digit',
          month: '2-digit',
          year: 'numeric',
        });
      }
    } catch {
      // Keep original string if parsing fails
    }
  }

  // Build firecall name/description
  const firecallName =
    calculation.callDescriptionOverride || firecall.name || '';

  return {
    recipient: {
      name: calculation.recipient.name,
      email: calculation.recipient.email,
      address: calculation.recipient.address,
      phone: calculation.recipient.phone,
    },
    firecall: {
      name: firecallName,
      date: formattedDate,
      description: firecall.description || '',
    },
    calculation: {
      totalSum: formatCurrency(calculation.totalSum),
      defaultStunden: calculation.defaultStunden,
      comment: calculation.comment,
    },
  };
}

/**
 * Render a template string with the given context
 */
export function renderTemplate(
  template: string,
  context: EmailTemplateContext,
): string {
  try {
    return nunjucksEnv.renderString(template, context);
  } catch (error) {
    console.error('Template rendering error:', error);
    // Return original template if rendering fails
    return template;
  }
}

/**
 * Render both subject and body templates
 */
export function renderEmailTemplates(
  config: KostenersatzEmailConfig,
  context: EmailTemplateContext,
): { subject: string; body: string } {
  return {
    subject: renderTemplate(config.subjectTemplate, context),
    body: renderTemplate(config.bodyTemplate, context),
  };
}

/**
 * Validate email address format
 */
export function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

/**
 * Parse comma-separated email addresses
 */
export function parseEmailList(emailString: string): string[] {
  return emailString
    .split(',')
    .map((e) => e.trim())
    .filter((e) => e.length > 0 && isValidEmail(e));
}
