import 'server-only';

import { getBaseUrl } from '../auth/baseUrl';
import { mailSender, sendRawMail } from '../mail/sendRawMail';
import {
  buildReporterNotificationEmail,
  hasReporterNews,
  isSafeMailAddress,
  type ReporterNotificationInput,
} from './reporterNotificationEmail';

export type ReporterNotificationResult =
  | { status: 'sent'; to: string }
  | { status: 'skipped'; reason: string }
  | { status: 'failed'; error: string };

/**
 * Schickt dem Melder eine kurze Mail mit Link auf „Meine Meldungen“.
 *
 * Best effort: Die Änderung am Report ist zu diesem Zeitpunkt schon
 * gespeichert, eine ausgefallene Mail darf sie nicht zurückdrehen. Das
 * Ergebnis geht an den Aufrufer (Snackbar im Admin-Bereich, Antwort des
 * MCP-Tools), damit der Bearbeiter weiß, ob der Melder Bescheid bekommen hat.
 */
export async function notifyReporter(
  input: ReporterNotificationInput,
): Promise<ReporterNotificationResult> {
  if (!hasReporterNews(input)) {
    return {
      status: 'skipped',
      reason:
        'nothing for the reporter: only a closing status, a resolution or a reporter-visible comment triggers a mail',
    };
  }
  const to = input.report.createdBy?.email;
  if (!isSafeMailAddress(to)) {
    return { status: 'skipped', reason: 'reporter has no valid email address' };
  }
  const from = mailSender();
  if (!from) {
    return { status: 'skipped', reason: 'email service not configured' };
  }
  try {
    const appBaseUrl = await getBaseUrl();
    const { raw } = buildReporterNotificationEmail({
      ...input,
      appBaseUrl,
      from,
      to,
    });
    await sendRawMail(raw);
    return { status: 'sent', to };
  } catch (err) {
    console.error('bug report reporter notification failed:', err);
    return {
      status: 'failed',
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
