/**
 * Kostenersatz Email Configuration and Template Rendering
 */

import { absenderNameOf, type GroupStammdaten } from './groupStammdaten';
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
  /** Absender und Bankverbindung der Gruppe — als Platzhalter im Vorlagentext. */
  absender: {
    name: string;
    adresse: string;
    kontakt: string;
    kontoinhaber: string;
    iban: string;
    bic: string;
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

/**
 * Untersammlung unter `groups/{groupId}` — vorher ein einzelnes Dokument auf
 * Wurzelebene. Mit der Bankverbindung je Gruppe muss auch der Mailtext je
 * Gruppe gelten, sonst stünde in ihm die IBAN einer anderen Feuerwehr.
 */
export const KOSTENERSATZ_CONFIG_COLLECTION = 'kostenersatzConfig';
export const KOSTENERSATZ_EMAIL_CONFIG_DOC = 'email';

// ============================================================================
// Default Templates
// ============================================================================

export const DEFAULT_EMAIL_CONFIG: KostenersatzEmailConfig = {
  // Leer und nicht auf eine Adresse gesetzt: Eine hier eingetragene
  // Absenderadresse ginge im Namen einer fremden Feuerwehr hinaus.
  fromEmail: '',
  ccEmail: '',
  subjectTemplate: 'Kostenersatz - {{ absender.name }} - {{ firecall.date }}',
  bodyTemplate: `Sehr geehrte(r) {{ recipient.name }},

Anbei finden Sie die Abrechnung für den Kostenersatz zum Einsatz {{ firecall.name }} am {{ firecall.date }}.
Laut Landesgesetztblatt Nr. 77/2023 des Burgenlandes hat die Feuerwehr das Recht Kostenersatz zu fordern.

Sollte der Kostenersatz nicht vor Ort beglichen sein, bitte den Betrag auf folgendes Konto überweisen:

{{ absender.kontoinhaber }}
{{ absender.iban }}
{{ absender.bic }}



Dear {{ recipient.name }},

Attached you will find the reimbursement for the emergency call {{ firecall.name }} on {{ firecall.date }}.
As by Austrian law (LgBl Nr. 77/2023 Burgenland) the fire department has the right to request reimbursement.

If the payment didn't take place on the scene, please transfer the pending amount to the following bank account:

{{ absender.kontoinhaber }}
{{ absender.iban }}
{{ absender.bic }}`,
};

// ============================================================================
// Template Rendering
// ============================================================================

/**
 * Build template context from calculation and firecall data
 */
export function buildTemplateContext(
  calculation: KostenersatzCalculation,
  firecall: Firecall,
  stammdaten: GroupStammdaten,
  feuerwehrName?: string,
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
    calculation.nameOverride || firecall.name || '';

  const absender = absenderNameOf(stammdaten, feuerwehrName);

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
    absender: {
      name: absender,
      adresse: stammdaten.absenderAdresse,
      kontakt: stammdaten.absenderKontakt,
      kontoinhaber: stammdaten.kontoinhaber.trim() || absender,
      iban: stammdaten.iban,
      bic: stammdaten.bic,
    },
  };
}

/**
 * Render a template string with the given context.
 * Supports {{ var.path }} dot-notation substitution.
 */
export function renderTemplate(
  template: string,
  // `object` statt nur `EmailTemplateContext`: Die Füllungsrechnung hat einen
  // eigenen Kontext, die Ersetzung ist dieselbe. Der Rumpf arbeitet ohnehin
  // über `unknown`.
  context: EmailTemplateContext | object,
): string {
  try {
    return template.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (match, path: string) => {
      const value = path
        .split('.')
        .reduce(
          (obj: unknown, key: string) =>
            obj != null && typeof obj === 'object'
              ? (obj as Record<string, unknown>)[key]
              : undefined,
          context as unknown,
        );
      return value != null ? String(value) : match;
    });
  } catch (error) {
    console.error('Template rendering error:', error);
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
