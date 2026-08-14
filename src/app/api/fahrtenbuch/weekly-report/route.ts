import { NextResponse, type NextRequest } from 'next/server';
import { sendWeeklyReports } from '../../../../components/Fahrtenbuch/sendWeeklyReports';
import {
  ReportPeriodError,
  resolveReportPeriod,
  type ReportPeriod,
  type ReportPeriodRequest,
} from '../../../../components/Fahrtenbuch/weeklyReportPeriod';
import cronRequired from '../../../../server/auth/cronRequired';
import { ApiException } from '../../errors';

/**
 * Der Wochenbericht des Fahrtenbuchs, angestoßen von Cloud Scheduler.
 *
 * Bewusst ein Route Handler und keine Server Action: Aufrufer ist kein Browser
 * mit Session, sondern ein Zeitplan mit OIDC-Token.
 *
 * Der Lauf muss innerhalb des Cloud-Run-Timeouts von 300 s fertig werden. Bei
 * einer Gruppe mit einem Dutzend Fahrzeugen ist das kein Thema; die
 * 92-Tage-Grenze in `resolveReportPeriod` ist der Riegel, der es so hält.
 */

interface WeeklyReportBody extends ReportPeriodRequest {
  dryRun?: boolean;
}

/**
 * Ein leerer Body ist zulässig — Cloud Scheduler schickt ohne Payload keinen
 * und setzt dann auch keinen `Content-Type`. Ein `req.json()`, das daran wirft,
 * darf den Lauf nicht verhindern: Ohne Angabe gilt die letzte abgeschlossene
 * Woche, und genau das ist der Regelfall des Montagslaufs.
 */
async function readBody(req: NextRequest): Promise<WeeklyReportBody> {
  try {
    return ((await req.json()) as WeeklyReportBody | null) ?? {};
  } catch {
    return {};
  }
}

export async function POST(req: NextRequest) {
  // Zuerst der Guard, vor dem Lesen des Bodys: Ein nicht berechtigter Aufrufer
  // soll den Endpoint nicht dazu bringen, überhaupt etwas mit seiner Eingabe
  // zu tun.
  try {
    await cronRequired(req);
  } catch (err) {
    const status = err instanceof ApiException ? err.status : 403;
    return NextResponse.json({ error: (err as Error).message }, { status });
  }

  const body = await readBody(req);

  let period: ReportPeriod;
  try {
    period = resolveReportPeriod({
      year: body.year,
      week: body.week,
      from: body.from,
      to: body.to,
    });
  } catch (err) {
    // Eine unbrauchbare Angabe ist ein Fehler des Aufrufers und keiner des
    // Servers. Zurück geht der Schlüssel und nicht die Prosa-Meldung: Der
    // Schlüssel ist der Vertrag, an dem der Aufrufer entscheiden kann.
    if (err instanceof ReportPeriodError) {
      return NextResponse.json({ error: err.key }, { status: 400 });
    }
    console.error('weekly-report: Zeitraum nicht auflösbar', err);
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }

  try {
    const results = await sendWeeklyReports({
      period,
      dryRun: body.dryRun === true,
    });

    // 500 nur, wenn nichts durchkam und mindestens eine Gruppe scheiterte —
    // dann ist die Wiederholung durch den Scheduler gefahrlos. Bei einem
    // Teilerfolg bekäme sonst die erfolgreiche Gruppe ihre Mail doppelt, und
    // ein Lauf, in dem alle Gruppen übersprungen wurden, ist gar kein Fehler.
    const delivered = results.some(
      (r) => r.status === 'sent' || r.status === 'dryRun',
    );
    const failed = results.some((r) => r.status === 'failed');
    const status = !delivered && failed ? 500 : 200;

    return NextResponse.json({ period, results }, { status });
  } catch (err) {
    console.error('weekly-report failed', err);
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
