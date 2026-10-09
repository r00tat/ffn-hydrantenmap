import { NextResponse, type NextRequest } from 'next/server';
import { sendAblaufReports } from '../../../../components/Geraete/sendAblaufReports';
import cronRequired from '../../../../server/auth/cronRequired';
import { ApiException } from '../../errors';

/**
 * Die wöchentliche Sammelmail zu abgelaufenen und bald ablaufenden Chargen,
 * angestoßen von Cloud Scheduler.
 *
 * Ein Route Handler und keine Server Action: Aufrufer ist ein Zeitplan mit
 * OIDC-Token, kein Browser mit Session — wie beim Wochenbericht des
 * Fahrtenbuchs.
 */

/**
 * Tolerant gelesen: Cloud Scheduler schickt ohne Payload keinen Body, und ein
 * `req.json()`, das daran wirft, darf den Lauf nicht verhindern. `dryRun` gilt
 * nur bei einem echten `true`.
 */
async function readDryRun(req: NextRequest): Promise<boolean> {
  try {
    const body = (await req.json()) as { dryRun?: unknown } | null;
    return body?.dryRun === true;
  } catch {
    return false;
  }
}

export async function POST(req: NextRequest) {
  // Zuerst der Guard, vor dem Lesen des Bodys.
  try {
    await cronRequired(req);
  } catch (err) {
    const status = err instanceof ApiException ? err.status : 403;
    return NextResponse.json({ error: (err as Error).message }, { status });
  }

  const dryRun = await readDryRun(req);

  try {
    const results = await sendAblaufReports({ dryRun });

    // 500 nur, wenn nichts durchkam und mindestens eine Gruppe scheiterte —
    // dann ist die Wiederholung durch den Scheduler gefahrlos. Bei einem
    // Teilerfolg bekäme die erfolgreiche Gruppe ihre Mail sonst doppelt.
    const delivered = results.some((r) => r.status === 'sent' || r.status === 'dryRun');
    const failed = results.some((r) => r.status === 'failed');
    const status = !delivered && failed ? 500 : 200;

    return NextResponse.json({ results }, { status });
  } catch (err) {
    console.error('ablauf-report failed', err);
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
