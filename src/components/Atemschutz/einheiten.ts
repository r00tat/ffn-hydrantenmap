import type { AtemschutzTrupp } from '../../common/atemschutz';

/**
 * Die Zuordnung eines Trupps zu einer taktischen Einheit.
 *
 * Getragen wird sie von `entsendetAn` am Trupp — dasselbe Feld, das der
 * Sammelplatz beim Entsenden füllt. Ein zweites Feld für „meine Einheit" wäre
 * eine zweite Wahrheit über dieselbe Frage: Ein Trupp gehört zu genau einer
 * Einheit, egal ob ihn der Sammelplatz dorthin geschickt hat oder ob die
 * Einheit ihn selbst ausgerüstet hat.
 *
 * Zwei Sammelkategorien treten neben die benannten Einheiten, weil beide im
 * Einsatz eine eigene Aussage sind: **Sammelplatz** heißt „steht dort bereit,
 * niemand führt die Zeitkontrolle", **nicht zugeordnet** heißt „jemand
 * überwacht, hat aber nicht gesagt, für welche Einheit". Das Zweite ist eine
 * Lücke in der Dokumentation und soll auffallen.
 */

/** „Alle Trupps" — der Reiter der Gesamtlage. */
export const ALLE_EINHEITEN = '__alle__';
/** Trupps am Atemschutzsammelplatz: ohne Einheit und ohne Zeitkontrolle. */
export const ASSP_EINHEIT = '__assp__';
/** Trupps unter Zeitkontrolle, aber ohne eingetragene Einheit. */
export const OHNE_EINHEIT = '__ohne__';

const SAMMELKATEGORIEN: string[] = [
  ALLE_EINHEITEN,
  ASSP_EINHEIT,
  OHNE_EINHEIT,
];

/** Steht der Schlüssel für eine wirkliche Einheit — oder für eine Kategorie? */
export function istEinheitName(key: string): boolean {
  return !!key?.trim() && !SAMMELKATEGORIEN.includes(key);
}

/** Die Felder, aus denen die Zuordnung hervorgeht. */
export type ZuordnungsFelder = Pick<
  AtemschutzTrupp,
  'entsendetAn' | 'ueberwachungSeit' | 'ueberwachungBis'
>;

/**
 * Wem der Trupp zugeordnet ist — der Schlüssel, unter dem er einsortiert wird.
 *
 * Eine eingetragene Einheit gewinnt immer, auch nach der Rückgabe an den
 * Sammelplatz: Die Zeile ist der Nachweis über den Einsatz *dieser* Einheit,
 * und sie soll im Protokoll der Einheit stehen bleiben. Dass der Trupp danach
 * zum Sammelplatz ging, sagt `ueberwachungBis` (Chip auf der Karte).
 */
export function zuordnungKey(trupp: ZuordnungsFelder): string {
  const einheit = trupp.entsendetAn?.trim();
  if (einheit) return einheit;
  // Vor der Übernahme und nach der Rückgabe ist der Trupp Sache des
  // Sammelplatzes: Regeneration, Flaschen, Ausrüstung (FH-06 5.3.4).
  if (!trupp.ueberwachungSeit || trupp.ueberwachungBis) return ASSP_EINHEIT;
  return OHNE_EINHEIT;
}

export interface EinheitOptionenArgs {
  /** Alle Zeilen des Einsatzes — daraus die tatsächlich vergebenen Einheiten. */
  trupps: Pick<AtemschutzTrupp, 'entsendetAn'>[];
  /** Fahrzeuge und taktische Einheiten des Einsatzes. */
  bekannt: string[];
  /** Die aktuelle Wahl des Geräts, damit sie nie aus der Liste fällt. */
  gewaehlt?: string;
}

/**
 * Die Einheiten, die als Vorschlag und zur Wahl der eigenen Einheit taugen.
 *
 * Warum nicht bloß die am Trupp vergebenen: Beim ersten Trupp eines Einsatzes
 * ist keine vergeben, und die Liste stünde leer da — genau in dem Moment, in
 * dem der Gruppenkommandant sein Fahrzeug wählen will. Die Fahrzeuge und
 * taktischen Einheiten des Einsatzes stehen deshalb immer darin.
 *
 * Verglichen wird ohne Rücksicht auf Groß- und Kleinschreibung, behalten wird
 * die zuerst gesehene Schreibweise: `entsendetAn` ist Freitext, und derselbe
 * Wagen zweimal in der Liste wären zwei Ansichten desselben Einsatzes.
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
    if (!wert || !istEinheitName(wert)) return;
    const key = wert.toLowerCase();
    if (gesehen.has(key)) return;
    gesehen.add(key);
    namen.push(wert);
  };

  // Die vergebenen zuerst: Ihre Schreibweise steht am Dokument und ist die,
  // unter der die Anzeige tatsächlich gruppiert.
  for (const trupp of trupps) add(trupp.entsendetAn);
  add(gewaehlt);
  for (const name of bekannt) add(name);

  return namen.sort((a, b) => a.localeCompare(b, 'de'));
}

export interface EinheitTab {
  key: string;
  /** Nur bei einer benannten Einheit; die Kategorien beschriftet die Seite. */
  name?: string;
  /** Wie viele **aktuelle** Bereitstellungen darunter fallen. */
  anzahl: number;
}

export interface EinheitTabsArgs {
  /** Alle Zeilen — sie entscheiden, welche Reiter es gibt. */
  trupps: ZuordnungsFelder[];
  /** Die jüngsten Bereitstellungen — sie liefern die Zahl am Reiter. */
  aktuell: ZuordnungsFelder[];
  /** Die eigene Einheit des Geräts. */
  gewaehlt?: string;
}

/**
 * Die Reiter der Überwachungsseite.
 *
 * Reihenfolge: **die eigene Einheit zuerst**, dann die übrigen alphabetisch,
 * dann Sammelplatz und Nicht-zugeordnet, zuletzt die Gesamtlage. Wer am
 * Fahrzeug steht, sucht seine eigenen Trupps und nicht die Liste aller.
 *
 * Die eigene Einheit bleibt auch ohne Trupp daran stehen — sonst hätte die Wahl
 * keine Wirkung, solange niemand einen Trupp erfasst hat, und genau dort
 * entsteht der erste. Die beiden Kategorien erscheinen nur, wenn es Zeilen für
 * sie gibt: Ein Reiter „Nicht zugeordnet (0)" wäre eine Frage ohne Anlass.
 *
 * Gezählt werden nur die aktuellen Bereitstellungen. Die Zahl soll „so viele
 * Trupps sind das jetzt" heißen; über das Protokoll gezählt vervielfachte jeder
 * erneute Einsatz denselben Trupp.
 */
export function einheitTabs({
  trupps,
  aktuell,
  gewaehlt,
}: EinheitTabsArgs): EinheitTab[] {
  const zaehle = (passt: (t: ZuordnungsFelder) => boolean) =>
    aktuell.filter(passt).length;

  const namen = einheitOptionen({
    trupps,
    // Bewusst **nicht** die Fahrzeuge des Einsatzes: Das wären zwanzig Reiter,
    // von denen neunzehn leer sind. Die Fahrzeuge gehören in die Wahl der
    // eigenen Einheit, nicht in die Reiterzeile.
    bekannt: [],
    gewaehlt,
  });

  const eigene = gewaehlt && istEinheitName(gewaehlt) ? gewaehlt : undefined;
  const sortiert = eigene
    ? [eigene, ...namen.filter((n) => n.toLowerCase() !== eigene.toLowerCase())]
    : namen;

  const tabs: EinheitTab[] = sortiert.map((name) => ({
    key: name,
    name,
    anzahl: zaehle((t) => truppPasstZuEinheit(t, name)),
  }));

  for (const kategorie of [ASSP_EINHEIT, OHNE_EINHEIT]) {
    if (!trupps.some((t) => zuordnungKey(t) === kategorie)) continue;
    tabs.push({
      key: kategorie,
      anzahl: zaehle((t) => zuordnungKey(t) === kategorie),
    });
  }

  tabs.push({ key: ALLE_EINHEITEN, anzahl: aktuell.length });
  return tabs;
}

/**
 * Ob ein Trupp unter dem gewählten Reiter angezeigt wird.
 *
 * Scharf getrennt, und zwar in **allen** Abschnitten. Vorher rutschte ein
 * Trupp ohne Zuordnung durch jeden Filter — mit der Folge, dass „Zurück" und
 * „Protokoll" bei der Wahl einer Einheit unverändert blieben und niemand mehr
 * sagen konnte, welche Trupps die eigenen sind. Die Trupps des Sammelplatzes
 * sind jetzt unter ihrem eigenen Reiter zu finden, mit Anzahl.
 */
export function truppPasstZuEinheit(
  trupp: ZuordnungsFelder,
  einheit: string,
): boolean {
  if (einheit === ALLE_EINHEITEN) return true;
  const key = zuordnungKey(trupp);
  return key.toLowerCase() === einheit.trim().toLowerCase();
}
