import type { AtemschutzTrupp } from '../../common/atemschutz';
import {
  RESERVEDRUCK_BAR,
  sortierteAbfragen,
  type UeberwachungStand,
} from '../../common/atemschutzUeberwachung';

/**
 * Das Modell hinter der Druckverlaufs-Grafik.
 *
 * Getrennt von der Zeichnung, weil hier die Aussagen stehen: welcher Wert
 * gemessen und welcher fortgeschrieben ist, wo die Drittelmarken liegen, bis
 * wann die Achse reicht. Eine schiefe Achse verschiebt die Steigung, und die
 * Steigung ist genau das, was jemand aus der Grafik abliest („wie schnell geht
 * die Luft weg?").
 *
 * Reine Zahlen und keine Pixel: Die Umrechnung in Koordinaten macht die
 * Komponente, die auch ihre Größe kennt.
 */

/** Woher ein Messpunkt kommt — die Grafik beschriftet danach. */
export type PunktArt =
  | 'abmarsch'
  | 'abfrage'
  | 'ziel'
  | 'rueckzug'
  | 'rueckkehr';

export interface VerlaufPunkt {
  /** Zeit in ms seit der Epoche. */
  t: number;
  druck: number;
  art: PunktArt;
}

/** Eine senkrechte Marke auf der Zeitachse. */
export type MarkeKey = 'drittel' | 'zweiDrittel' | 'ende' | 'jetzt';

export interface Marke {
  key: MarkeKey;
  t: number;
}

/** Eine waagrechte Druckschwelle. */
export type LinieKey = 'rueckzug' | 'reserve';

export interface DruckLinie {
  key: LinieKey;
  druck: number;
}

export interface DruckVerlaufModell {
  /** Abmarsch — der Nullpunkt der Zeitachse. */
  tStart: number;
  tEnde: number;
  druckMax: number;
  /** Gemessene Werte, aufsteigend. */
  punkte: VerlaufPunkt[];
  /**
   * Die Fortschreibung vom letzten Messwert bis zur maßgeblichen Schwelle —
   * gestrichelt gezeichnet, weil sie eine Annahme ist und keine Ablesung.
   */
  prognose?: { von: VerlaufPunkt; bis: { t: number; druck: number } };
  marken: Marke[];
  linien: DruckLinie[];
}

function zeit(iso?: string): number {
  const wert = new Date(iso ?? '').getTime();
  return Number.isNaN(wert) ? Number.NaN : wert;
}

/**
 * Baut das Modell aus Trupp und Stand.
 *
 * `undefined`, wenn es nichts zu zeichnen gibt: ohne Abmarsch gibt es keine
 * Zeitachse, und mit einem einzigen Punkt keine Linie — eine Grafik mit einem
 * Punkt darin nimmt nur Platz weg.
 */
export function baueDruckVerlauf(
  trupp: Pick<
    AtemschutzTrupp,
    'abmarschZeit' | 'abfragen' | 'rueckkehrZeit' | 'druckRueckkehr' | 'status'
  >,
  stand: UeberwachungStand,
  jetzt: Date,
): DruckVerlaufModell | undefined {
  const tStart = zeit(trupp.abmarschZeit);
  if (!Number.isFinite(tStart)) return undefined;

  const punkte: VerlaufPunkt[] = [
    { t: tStart, druck: stand.startdruck, art: 'abmarsch' },
    ...sortierteAbfragen(trupp).map((a) => ({
      t: zeit(a.zeitpunkt),
      druck: a.druck,
      // Rückzug schlägt Ankunft: Trägt eine Meldung beides, ist der Rückzug
      // die jüngere und für den Verlauf die wichtigere Aussage.
      art: (a.rueckzug ? 'rueckzug' : a.amZiel ? 'ziel' : 'abfrage') as PunktArt,
    })),
  ];

  const tRueckkehr = zeit(trupp.rueckkehrZeit);
  if (
    Number.isFinite(tRueckkehr) &&
    typeof trupp.druckRueckkehr === 'number' &&
    Number.isFinite(trupp.druckRueckkehr)
  ) {
    punkte.push({
      t: tRueckkehr,
      druck: trupp.druckRueckkehr,
      art: 'rueckkehr',
    });
  }
  punkte.sort((a, b) => a.t - b.t);
  if (punkte.length < 2) return undefined;

  const imEinsatz = trupp.status === 'imEinsatz';
  const letzter = punkte[punkte.length - 1];

  // Fortgeschrieben wird bis zur Schwelle, die *jetzt* maßgeblich ist: bis zum
  // Rückzugsdruck, und nach der Rückzugsmeldung bis zur Restdruckwarnung — die
  // Frist ist dann erfüllt, beobachtet wird die Reserve.
  const zielDruck = stand.rueckzugSeit ? RESERVEDRUCK_BAR : stand.rueckzugsDruck;
  const zielZeit = zeit(
    stand.rueckzugSeit ? stand.restdruckZeit : stand.rueckzugZeit,
  );
  const prognose =
    imEinsatz && Number.isFinite(zielZeit) && zielZeit > letzter.t
      ? { von: letzter, bis: { t: zielZeit, druck: zielDruck } }
      : undefined;

  const marken: Marke[] = [
    { key: 'drittel' as const, t: zeit(stand.drittelZeit) },
    { key: 'zweiDrittel' as const, t: zeit(stand.zweiDrittelZeit) },
    // Das rechnerische Einsatzende — der Anhaltswert der Unterlage, nicht die
    // Prognose aus dem gemessenen Verbrauch. Beides zu zeigen ist der Sinn der
    // Grafik: Wer schneller verbraucht, sieht seine Linie vor der Marke
    // ankommen.
    { key: 'ende' as const, t: tStart + stand.erwarteteDauerMin * 60_000 },
    ...(imEinsatz ? [{ key: 'jetzt' as const, t: jetzt.getTime() }] : []),
  ].filter((m) => Number.isFinite(m.t));

  const linien: DruckLinie[] = [
    { key: 'rueckzug', druck: stand.rueckzugsDruck },
    // Nur, wenn die Restdruckwarnung nicht ohnehin der Rückzugsdruck ist —
    // zwei Linien auf derselben Höhe wären eine zu viel.
    ...(stand.rueckzugsDruck > RESERVEDRUCK_BAR
      ? [{ key: 'reserve' as const, druck: RESERVEDRUCK_BAR }]
      : []),
  ];

  const tEnde = Math.max(
    letzter.t,
    prognose?.bis.t ?? letzter.t,
    ...marken.map((m) => m.t),
  );

  return {
    tStart,
    // Nie null breit: Ein Trupp, der in derselben Sekunde abmarschiert und
    // gemeldet hat, hätte sonst eine Achse ohne Länge und damit eine Division
    // durch 0 in der Zeichnung.
    tEnde: tEnde > tStart ? tEnde : tStart + 60_000,
    druckMax: Math.max(stand.startdruck, ...punkte.map((p) => p.druck)),
    punkte,
    ...(prognose ? { prognose } : {}),
    marken,
    linien,
  };
}
