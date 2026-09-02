import type { AtemschutzTrupp } from '../../common/atemschutz';

/**
 * Die Zuordnung eines Trupps zu einer taktischen Einheit.
 *
 * Getragen wird sie von `entsendetAn` am Trupp — dasselbe Feld, das der
 * Sammelplatz beim Entsenden füllt. Ein zweites Feld für „meine Einheit" wäre
 * eine zweite Wahrheit über dieselbe Frage: Ein Trupp gehört zu genau einer
 * Einheit, egal ob ihn der Sammelplatz dorthin geschickt hat oder ob die
 * Einheit ihn selbst ausgerüstet hat.
 */

/** Der Platzhalter „Alle Trupps" im Einheitenfilter. */
export const ALLE_EINHEITEN = '__alle__';

export interface EinheitOptionenArgs {
  /** Alle Zeilen des Einsatzes — daraus die tatsächlich vergebenen Einheiten. */
  trupps: Pick<AtemschutzTrupp, 'entsendetAn'>[];
  /** Fahrzeuge und taktische Einheiten des Einsatzes. */
  bekannt: string[];
  /** Die aktuelle Wahl des Geräts, damit sie nie aus der Liste fällt. */
  gewaehlt?: string;
}

/**
 * Die Einheiten, unter denen die Überwachung gefiltert und zugeordnet werden
 * kann.
 *
 * Warum nicht bloß die am Trupp vergebenen: Beim ersten Trupp eines Einsatzes
 * ist keine vergeben, und der Filter stünde leer da — genau in dem Moment, in
 * dem der Gruppenkommandant sein Fahrzeug wählen will. Die Fahrzeuge und
 * taktischen Einheiten des Einsatzes stehen deshalb immer darin.
 *
 * Verglichen wird ohne Rücksicht auf Groß- und Kleinschreibung, behalten wird
 * die zuerst gesehene Schreibweise: `entsendetAn` ist Freitext, und derselbe
 * Wagen zweimal im Filter wären zwei Ansichten desselben Einsatzes.
 */
export function einheitOptionen({
  trupps,
  bekannt,
  gewaehlt,
}: EinheitOptionenArgs): string[] {
  const gesehen = new Set<string>();
  const namen: string[] = [];
  const add = (roh?: string) => {
    const wert = roh?.trim();
    if (!wert || wert === ALLE_EINHEITEN) return;
    const key = wert.toLowerCase();
    if (gesehen.has(key)) return;
    gesehen.add(key);
    namen.push(wert);
  };

  // Die vergebenen zuerst: Ihre Schreibweise steht am Dokument und ist die,
  // unter der der Filter tatsächlich trifft.
  for (const trupp of trupps) add(trupp.entsendetAn);
  add(gewaehlt);
  for (const name of bekannt) add(name);

  return namen.sort((a, b) => a.localeCompare(b, 'de'));
}

/**
 * Ob ein Trupp unter der gewählten Einheit angezeigt wird.
 *
 * Ein Trupp **ohne** Zuordnung passt zu jeder Einheit: Am Sammelplatz
 * bereitgestellte Trupps tragen noch keine, und wer den Filter gesetzt hat,
 * müsste ihn sonst wieder wegnehmen, um einen Trupp übernehmen zu können. Die
 * Zuordnung entsteht ja gerade dabei.
 */
export function truppPasstZuEinheit(
  trupp: Pick<AtemschutzTrupp, 'entsendetAn'>,
  einheit: string,
): boolean {
  if (einheit === ALLE_EINHEITEN) return true;
  const ziel = trupp.entsendetAn?.trim();
  if (!ziel) return true;
  return ziel.toLowerCase() === einheit.trim().toLowerCase();
}
