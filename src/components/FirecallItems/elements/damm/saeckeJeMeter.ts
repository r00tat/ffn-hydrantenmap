/**
 * Sandsackbedarf und Verlegezeit nach der Lehrunterlage.
 *
 * **Quelle:** „Feuerwehr und Hochwasser", Abschnitt 3.3 „Sandsackanwendung und
 * Dammverteidigung", Lehrunterlage `LU_TE3_Gesamt_Teil1_20200130_v03`, S. 37
 * („Bedarf an Helfern zum Verlegen"). Herleitung und Gegenprüfung:
 * docs/dammbau-sandsaecke.md.
 *
 * | Höhe in m | 0,5 | 1,0 | 1,5 | 2,0 |
 * | --- | --- | --- | --- | --- |
 * | Säcke je Meter | 40 | 120 | 275 | 500 |
 * | Minuten je Meter bei 10 Helfern | 3 | 9 | 21 | 38 |
 *
 * Gerechnet wird mit der Tabelle und nicht mit einem Querschnittsmodell —
 * dieselbe Begründung wie bei der Reibungstabelle der Löschwasserförderung: Die
 * Reihe wächst **überquadratisch** (von 1 m auf 2 m das Vierfache wäre 480, die
 * Tabelle sagt 500), und kein Trapezquerschnitt wird überquadratisch. Ein aus
 * der Tabelle „eruiertes" Böschungsverhältnis trägt genau die
 * Tabelleninformation, nur schwerer nachprüfbar.
 */

/** Die Tabelle, nach Höhe aufsteigend. */
export const SAECKE_JE_METER: {
  hoehe: number;
  saecke: number;
  /** Minuten je Meter bei 10 Helfern — die zweite Zeile der Tabelle. */
  minutenBei10: number;
}[] = [
  { hoehe: 0.5, saecke: 40, minutenBei10: 3 },
  { hoehe: 1.0, saecke: 120, minutenBei10: 9 },
  { hoehe: 1.5, saecke: 275, minutenBei10: 21 },
  { hoehe: 2.0, saecke: 500, minutenBei10: 38 },
];

/**
 * Verlegeleistung in Säcken je Person und Stunde, aus der Tabelle abgeleitet.
 *
 * Die beiden Zeilen ergeben über alle vier Höhen praktisch denselben Wert:
 * 3 min × 10 Helfer ÷ 40 Säcke = 0,75 Personenminuten je Sack, ebenso
 * 9 × 10 ÷ 120 = 0,75, dann 21 × 10 ÷ 275 = 0,76 und 38 × 10 ÷ 500 = 0,76. Das
 * ist die Aussage hinter der Zeitzeile: **Verlegen kostet rund 0,75
 * Personenminuten je Sack**, unabhängig von der Dammhöhe — 80 Säcke je Person
 * und Stunde. Die Streuung (80 / 80 / 78,6 / 79,0) ist die Rundung der Tabelle.
 */
export const VERLEGE_LEISTUNG = 80;

/**
 * Säcke je laufendem Meter für eine Dammhöhe.
 *
 * **Interpoliert wird in h², nicht in h**: Der Bedarf wächst mit dem Querschnitt
 * und damit quadratisch mit der Höhe. Linear in h interpoliert läge der Wert bei
 * 0,75 m um 15 % zu hoch.
 *
 * Unter der ersten Tabellenzeile wird auf (0 | 0) hinuntergeführt — bei 0,3 m
 * ergibt das 14,4 Säcke je Meter und trifft damit die Tabelle für 100 Laufmeter
 * auf S. 35 (2.400–3.000 Säcke je 100 m für den Pyramidenstapel wären 24–30, für
 * die flacheren Anordnungen dort 6–12,5).
 *
 * Über der letzten Zeile wird mit der Steigung des letzten Abschnitts
 * weitergerechnet. Für einen Sandsackdamm über 2 m warnt der Rechner ohnehin.
 */
export function saeckeJeMeter(hoehe: number): number {
  if (!(hoehe > 0)) return 0;

  const q = hoehe * hoehe;
  const stuetzen = [
    { q: 0, saecke: 0 },
    ...SAECKE_JE_METER.map((zeile) => ({
      q: zeile.hoehe * zeile.hoehe,
      saecke: zeile.saecke,
    })),
  ];

  for (let i = 1; i < stuetzen.length; i += 1) {
    if (q <= stuetzen[i].q) {
      const span = stuetzen[i].q - stuetzen[i - 1].q;
      const anteil = span > 0 ? (q - stuetzen[i - 1].q) / span : 0;
      return (
        stuetzen[i - 1].saecke +
        (stuetzen[i].saecke - stuetzen[i - 1].saecke) * anteil
      );
    }
  }

  // Über der Tabelle: mit der Steigung des letzten Abschnitts weiter.
  const letzte = stuetzen[stuetzen.length - 1];
  const vorletzte = stuetzen[stuetzen.length - 2];
  const steigung =
    (letzte.saecke - vorletzte.saecke) / (letzte.q - vorletzte.q);
  return letzte.saecke + (q - letzte.q) * steigung;
}

/** Ob die Höhe innerhalb der Tabelle liegt — außerhalb wird extrapoliert. */
export const inTabelle = (hoehe: number): boolean =>
  hoehe > 0 && hoehe <= SAECKE_JE_METER[SAECKE_JE_METER.length - 1].hoehe;
