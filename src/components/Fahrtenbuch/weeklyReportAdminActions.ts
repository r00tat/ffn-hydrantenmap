'use server';
import 'server-only';

import { actionGroupAdminRequired } from '../../app/auth';
import {
  sendWeeklyReportForGroup,
  type WeeklyReportResult,
} from './sendWeeklyReports';
import { sanitizeMangelEmails } from './stammdatenLogic';
import { ReportPeriodError, resolveReportPeriod } from './weeklyReportPeriod';

/**
 * Der manuelle Versand des Wochenberichts aus der Admin-Oberfläche.
 *
 * Eigene Datei und nicht in `stammdatenActions.ts`: Dort geht es um das Pflegen
 * von Stammdaten, hier um eine Handlung mit Außenwirkung — es werden Mails
 * verschickt.
 */

export interface SendWeeklyReportNowInput {
  groupId: string;
  /** ISO-Jahr der Kalenderwoche. */
  year: number;
  week: number;
  /**
   * Die Empfänger dieses Versands. Vorbelegt aus `mangelEmails`, hier aber
   * überschreibbar — die Überschreibung wird nicht gespeichert.
   */
  recipients: string[];
  dryRun?: boolean;
}

export interface SendWeeklyReportNowResult {
  success: boolean;
  /**
   * Maschinenlesbarer Schlüssel für die Oberfläche (`invalidWeek`,
   * `emailInvalid`, `tooManyEmails`, `noRecipients`) oder die Meldung eines
   * unerwarteten Fehlers.
   */
  error?: string;
  result?: WeeklyReportResult;
}

export async function sendWeeklyReportNow({
  groupId,
  year,
  week,
  recipients,
  dryRun = false,
}: SendWeeklyReportNowInput): Promise<SendWeeklyReportNowResult> {
  try {
    const session = await actionGroupAdminRequired(groupId);

    // Dieselbe Prüfung wie beim Pflegen der Empfänger: gleiche Höchstzahl,
    // gleiche Fehlerschlüssel, gleiches Entdoppeln.
    const { emails, error } = sanitizeMangelEmails(recipients);
    if (error) return { success: false, error };
    // Kein Rückfall auf die gepflegte Liste: Wer das Feld leer räumt, will
    // nicht ausgerechnet diese Adressen bemailen.
    if (emails.length === 0) return { success: false, error: 'noRecipients' };

    // `resolveReportPeriod` prüft Jahr und Woche streng (Ganzzahl, 2000–2100,
    // 1–53, und ob es die Woche im Jahr überhaupt gibt), deshalb hier keine
    // zweite Zahlenprüfung.
    const period = resolveReportPeriod({ year, week });

    const result = await sendWeeklyReportForGroup({
      groupId,
      period,
      recipients: emails,
      dryRun,
    });

    // Der Lauf verschickt Mails an gepflegte Verteilerlisten; wer ihn ausgelöst
    // hat, gehört ins Log.
    console.info('sendWeeklyReportNow', {
      groupId,
      isoYear: period.isoYear,
      week: period.week,
      recipientCount: emails.length,
      dryRun,
      status: result.status,
      by: session.user.id,
    });

    return { success: true, result };
  } catch (err) {
    console.error('sendWeeklyReportNow failed', err);
    // Der Schlüssel des Zeitraumfehlers ist der Vertrag mit der Oberfläche, die
    // Prosa-`message` nur fürs Log.
    if (err instanceof ReportPeriodError) {
      return { success: false, error: err.key };
    }
    return { success: false, error: (err as Error).message };
  }
}
