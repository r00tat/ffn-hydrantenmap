import { createTranslator } from 'next-intl';
import { NextResponse, type NextRequest } from 'next/server';
import de from '../../../../../messages/de.json';
import { sendUeberwachungWarnungen } from '../../../../components/Atemschutz/sendUeberwachungWarnungen';
import cronRequired from '../../../../server/auth/cronRequired';
import { ApiException } from '../../errors';

/**
 * Die Fristenprüfung der Atemschutzüberwachung.
 *
 * Ein Route Handler und keine Server Action: Aufrufer ist kein Browser mit
 * Session, sondern eine Cloud-Tasks-Aufgabe oder ein Zeitplan mit OIDC-Token —
 * dieselbe Bauweise wie beim Fahrtenbuch-Wochenbericht, und beide Aufrufer
 * tragen das Token desselben Invoker-Service-Accounts.
 *
 * **Zwei Aufrufer, ein Endpoint:**
 *
 * - Eine **Cloud-Tasks-Aufgabe** zum berechneten Termin — der Hauptweg. Die
 *   App legt sie an, sobald ein Trupp abmarschiert ist oder eine Druckabfrage
 *   die Fristen verschiebt (`planeUeberwachungTask`).
 * - Ein **seltener Zeitplan** als Netz: Bricht der Browser nach dem Schreiben
 *   ab, entsteht keine Aufgabe, und ohne den Lauf wartete niemand mehr.
 *
 * Der Lauf ist in beiden Fällen derselbe Rundumblick über alle Trupps im
 * Einsatz — er verschickt Fälliges und plant den nächsten Termin nach. Damit
 * repariert der Netz-Lauf genau das, was eine verlorene Aufgabe hinterlässt.
 */

interface CheckBody {
  dryRun?: boolean;
  /** ISO-Zeitpunkt für einen Nachlauf von Hand. Ohne Angabe gilt jetzt. */
  jetzt?: string;
  /**
   * Nur fürs Log: Die Aufgabe schreibt hinein, für welchen Trupp sie gedacht
   * war. Der Lauf prüft ohnehin alle — eine Zielangabe würde ihn nur enger
   * machen, als er sein soll.
   */
  quelle?: string;
  firecallId?: string;
  truppId?: string;
  warnung?: string;
}

/**
 * Ein leerer Body ist zulässig — Cloud Scheduler schickt ohne Payload keinen
 * und setzt dann auch keinen `Content-Type`.
 */
async function readBody(req: NextRequest): Promise<CheckBody> {
  try {
    return ((await req.json()) as CheckBody | null) ?? {};
  } catch {
    return {};
  }
}

/**
 * Die Texte kommen aus dem deutschen Katalog, nicht aus der Sprache des
 * Aufrufers: Aufrufer ist der Zeitplan. Die Sprache je Empfänger wäre erst
 * möglich, wenn der Lauf die Profile aller Empfänger liest — dieselbe
 * Vereinfachung wie beim Wochenbericht, der seinen Betreff ebenfalls
 * deutschsprachig baut.
 */
const t = createTranslator({
  locale: 'de',
  messages: de,
  namespace: 'atemschutz.ueberwachung',
});

/** Uhrzeit in der Zeitzone der Feuerwehr, nicht in UTC des Servers. */
function uhrzeit(iso: string): string {
  return new Date(iso).toLocaleTimeString('de-AT', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Europe/Vienna',
  });
}

export async function POST(req: NextRequest) {
  try {
    await cronRequired(req);
  } catch (err) {
    const status = err instanceof ApiException ? err.status : 403;
    return NextResponse.json({ error: (err as Error).message }, { status });
  }

  const body = await readBody(req);
  if (body.quelle === 'task') {
    // Ohne diese Zeile lässt sich im Log nicht unterscheiden, ob eine Warnung
    // aus einem Termin oder aus dem Netz-Lauf kam.
    console.info(
      `Atemschutzüberwachung: Termin für ${body.firecallId}/${body.truppId} (${body.warnung})`,
    );
  }
  const jetzt = body.jetzt ? new Date(body.jetzt) : undefined;
  if (jetzt && Number.isNaN(jetzt.getTime())) {
    return NextResponse.json({ error: 'invalidJetzt' }, { status: 400 });
  }

  try {
    const result = await sendUeberwachungWarnungen({
      jetzt,
      dryRun: body.dryRun === true,
      t,
      uhrzeit,
    });

    const gescheitert = result.results.filter(
      (r) => r.status === 'failed',
    ).length;
    // 500 nur, wenn *jede* Warnung gescheitert ist: Dann ist die Wiederholung
    // durch den Scheduler gefahrlos und sinnvoll. Bei Teilerfolg würde sie die
    // bereits verschickten Warnungen nicht wiederholen (sie sind vermerkt),
    // aber den Lauf unnötig doppeln.
    const alleGescheitert =
      gescheitert > 0 && gescheitert === result.results.length;

    return NextResponse.json(result, { status: alleGescheitert ? 500 : 200 });
  } catch (err) {
    console.error('ueberwachung-check fehlgeschlagen', err);
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
