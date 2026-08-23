/**
 * Befüllleistung eines Trupps nach der Lehrunterlage.
 *
 * **Quelle:** „Feuerwehr und Hochwasser", Abschnitt 3.3, Lehrunterlage
 * `LU_TE3_Gesamt_Teil1_20200130_v03`, S. 36 („Maximale Befüllleistung eines
 * Teams pro Stunde").
 *
 * | Team | ohne Trichter, ohne Rödeln | ohne Trichter, mit Rödeln | mit Trichter, ohne Rödeln | mit Trichter, mit Rödeln |
 * | --- | --- | --- | --- | --- |
 * | 2 Personen | 60 | 30 | 100 | 50 |
 * | 6 Personen | 320 | 160 | 400 | 200 |
 * | 10 Personen | 500 | 250 | 600 | 300 |
 * | 50 Personen | 2500 | 1250 | 3000 | 1500 |
 *
 * Es ist eine **Trupp**leistung, keine Personenleistung: Ein Zweiertrupp bringt
 * 30 Säcke je Person und Stunde, ein Zehnertrupp 50 — die Kette braucht eine
 * Mindestgröße, um zu laufen. Deshalb wird hier mit der Truppgröße
 * nachgeschlagen und nicht mit einem Wert je Person multipliziert.
 *
 * **Rödeln** ist das Zubinden und halbiert die Leistung. Für einen Damm wird
 * nicht zugebunden — die Unterlage sagt das ausdrücklich: „Sack nicht zubinden,
 * wenn er für weitgehend wasserdichte Dammerhöhung, Ring- oder Notdämme
 * verwendet wird", weil nicht zugebundene Säcke sich Unebenheiten besser
 * anpassen. Zugebunden wird für Dammschäden, zur Beschwerung und im
 * Unterwasserbau.
 */

export interface FuellLeistungOptionen {
  /** Füllhilfe im Einsatz — Trichter, Füllanlage, Füllmaschine. */
  trichter: boolean;
  /** Säcke werden zugebunden. Halbiert die Leistung. */
  roedeln: boolean;
}

/** Die Tabelle, nach Truppgröße aufsteigend. */
export const FUELL_LEISTUNG: {
  personen: number;
  ohneTrichter: number;
  ohneTrichterGeroedelt: number;
  mitTrichter: number;
  mitTrichterGeroedelt: number;
}[] = [
  {
    personen: 2,
    ohneTrichter: 60,
    ohneTrichterGeroedelt: 30,
    mitTrichter: 100,
    mitTrichterGeroedelt: 50,
  },
  {
    personen: 6,
    ohneTrichter: 320,
    ohneTrichterGeroedelt: 160,
    mitTrichter: 400,
    mitTrichterGeroedelt: 200,
  },
  {
    personen: 10,
    ohneTrichter: 500,
    ohneTrichterGeroedelt: 250,
    mitTrichter: 600,
    mitTrichterGeroedelt: 300,
  },
  {
    personen: 50,
    ohneTrichter: 2500,
    ohneTrichterGeroedelt: 1250,
    mitTrichter: 3000,
    mitTrichterGeroedelt: 1500,
  },
];

const spalte = (
  zeile: (typeof FUELL_LEISTUNG)[number],
  { trichter, roedeln }: FuellLeistungOptionen
): number => {
  if (trichter) {
    return roedeln ? zeile.mitTrichterGeroedelt : zeile.mitTrichter;
  }
  return roedeln ? zeile.ohneTrichterGeroedelt : zeile.ohneTrichter;
};

/**
 * Die Befüllleistung des ganzen Trupps in Säcken je Stunde.
 *
 * Zwischen den Zeilen linear in der Truppgröße — anders als beim Sackbedarf
 * gibt es hier keinen Grund für etwas anderes: Doppelt so viele Schaufeln
 * füllen doppelt so viele Säcke, solange Sand da ist. Über 50 Personen wird mit
 * der Leistung je Person des letzten Abschnitts weitergerechnet, unter 2
 * anteilig heruntergeführt.
 */
export function fuellLeistungTrupp(
  personen: number,
  optionen: FuellLeistungOptionen
): number {
  if (!(personen > 0)) return 0;

  const stuetzen = FUELL_LEISTUNG.map((zeile) => ({
    personen: zeile.personen,
    leistung: spalte(zeile, optionen),
  }));

  const erste = stuetzen[0];
  if (personen <= erste.personen) {
    // Ein Einzelner füllt nicht die Hälfte eines Zweiertrupps, aber besser als
    // gar keine Auskunft ist der anteilige Wert — und ein Trupp unter zwei
    // Personen ist ohnehin keine Lage, für die geplant wird.
    return (erste.leistung / erste.personen) * personen;
  }

  for (let i = 1; i < stuetzen.length; i += 1) {
    if (personen <= stuetzen[i].personen) {
      const span = stuetzen[i].personen - stuetzen[i - 1].personen;
      const anteil = span > 0 ? (personen - stuetzen[i - 1].personen) / span : 0;
      return (
        stuetzen[i - 1].leistung +
        (stuetzen[i].leistung - stuetzen[i - 1].leistung) * anteil
      );
    }
  }

  const letzte = stuetzen[stuetzen.length - 1];
  const vorletzte = stuetzen[stuetzen.length - 2];
  const jePerson =
    (letzte.leistung - vorletzte.leistung) /
    (letzte.personen - vorletzte.personen);
  return letzte.leistung + (personen - letzte.personen) * jePerson;
}

/** Die Befüllleistung je Person und Stunde bei dieser Truppgröße. */
export function fuellLeistungJePerson(
  personen: number,
  optionen: FuellLeistungOptionen
): number {
  if (!(personen > 0)) return 0;
  return fuellLeistungTrupp(personen, optionen) / personen;
}

/**
 * Transportleistung in Säcken je Person und Stunde, für eine Trageweite in m.
 *
 * **Quelle:** dieselbe Unterlage, S. 36: „In einer Stunde bewegt ein Mann ca
 * 80–100 Sandsäcke 10 m weit (Aufnehmen, Transportieren, Ablegen)". Genommen
 * wird die **untere** Grenze der Spanne: Beim Nachfordern von Kräften ist die
 * vorsichtige Zahl die brauchbarere.
 *
 * Umgekehrt proportional zur Weite — 20 m weit sind halb so viele Säcke. Das ist
 * die einfachste Annahme, die zur Quelle passt; sie unterschlägt, dass Aufnehmen
 * und Ablegen von der Weite unabhängig sind, und liegt damit wieder auf der
 * sicheren Seite.
 *
 * Die Unterlage nennt dazu die Faustregel für die Kette: „Für eine
 * Sandsackkette benötigt man je Meter etwa 1 Helfer."
 */
export const TRANSPORT_LEISTUNG_10M = 80;
export const TRANSPORT_WEITE_BASIS = 10;

export function transportLeistung(weite: number): number {
  if (!(weite > 0)) return TRANSPORT_LEISTUNG_10M;
  return (TRANSPORT_LEISTUNG_10M * TRANSPORT_WEITE_BASIS) / weite;
}

/** Helfer für eine Sandsackkette dieser Länge — 1 je Meter. */
export const kettenHelfer = (weite: number): number =>
  Math.max(0, Math.ceil(weite));
