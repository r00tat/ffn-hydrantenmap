'use client';

import type { Line } from '../../../firebase/firestore';
import { calculateDistance } from '../connection/distance';
import { connectionDisplayPositions } from '../connection/streetRouting';

/**
 * Sandsackbedarf für einen Dammabschnitt.
 *
 * Reine Geometrie und reine Arithmetik — kein Netzaufruf, kein Cache. Die
 * Dammlinie liegt auf der Karte, ihre Länge ist bekannt; alles andere sind
 * Querschnitt und Leistungswerte. Damit gibt es nichts zu invalidieren: Ein
 * Punkt wird verschoben, der Bedarf rechnet sich neu.
 *
 * Woher jede Kennzahl kommt, steht in docs/dammbau-sandsaecke.md. Das ist keine
 * Formsache: Die Sackzahl entscheidet über die Nachforderung von Material und
 * Personal, und eine Zahl, die niemand nachprüfen kann, ist im Führungsvorgang
 * wertlos.
 */

export type DammBauweise = 'einfach' | 'pyramide' | 'dammbalken';

export const DAMM_BAUWEISEN: DammBauweise[] = [
  'einfach',
  'pyramide',
  'dammbalken',
];

/**
 * Ein Sandsackformat.
 *
 * Zwei Volumen, absichtlich getrennt:
 *
 * - `fuellvolumen` ist der Sack **randvoll**. Was hineinkommt, sagt der
 *   Füllgrad — und daraus ergibt sich die Sandmenge und das Gewicht, das
 *   getragen werden muss.
 * - Die verlegten Maße sind der Raum, den der Sack **im Damm** einnimmt,
 *   Fugen eingerechnet. Sie gelten für den empfohlenen Füllgrad: Ein so
 *   gefüllter Sack wird beim Verlegen flachgetreten und liegt formschlüssig.
 *   Daraus ergibt sich die Sackzahl.
 *
 * Beide über einen Weg zu rechnen wäre falsch in beide Richtungen: Über das
 * Sandvolumen käme eine Sackzahl heraus, die die Fugen unterschlägt; über das
 * verlegte Volumen ein Sackgewicht, das keiner trägt.
 */
export interface SackFormat {
  /** Volumen des randvollen Sackes in m³. */
  fuellvolumen: number;
  /** Verlegte Länge quer zur Dammachse in m — bestimmt die Kronenbreite. */
  laenge: number;
  /** Verlegte Breite längs der Dammachse in m. */
  breite: number;
  /** Verlegte Höhe in m — die Höhe einer Lage. */
  hoehe: number;
}

/** Die Formate nach dem leeren Sackmaß in cm. Herkunft: docs/. */
export const SACK_FORMATE: Record<string, SackFormat> = {
  '30x60': { fuellvolumen: 0.015, laenge: 0.5, breite: 0.3, hoehe: 0.1 },
  '40x60': { fuellvolumen: 0.02, laenge: 0.5, breite: 0.4, hoehe: 0.1 },
  '30x50': { fuellvolumen: 0.0125, laenge: 0.42, breite: 0.3, hoehe: 0.1 },
};

export const SACK_FORMAT_KEYS = Object.keys(SACK_FORMATE);

/**
 * Vorbelegungen, alle belegt — Herkunft je Wert in
 * docs/dammbau-sandsaecke.md.
 */
export const DAMM_DEFAULTS = {
  /** Geplante Dammhöhe in m. */
  dammHoehe: 0.8,
  /** Sicherheitszuschlag über dem erwarteten Wasserstand in m. */
  freibord: 0.3,
  dammBauweise: 'pyramide' as DammBauweise,
  /** Basisbreite je Meter Höhe beim Pyramidenstapel. */
  dammBoeschung: 3,
  sackFormat: '30x60',
  /** Füllgrad in %. Zwei Drittel — nur so lässt sich der Sack binden. */
  sackFuellgrad: 66,
  /** Schüttdichte des Sandes in t/m³. */
  sandDichte: 1.5,
  /** Sackreserve in % für Bruch und Fehlfüllung. */
  dammReserve: 10,
  /** Eingesetzte Kräfte. */
  dammPersonal: 12,
  /** Gewünschte Fertigstellungszeit in h. */
  dammZielzeit: 4,
  /** Säcke je Person und Stunde beim Füllen von Hand. */
  fuellLeistung: 40,
  /** Säcke je Person und Stunde beim Tragen an die Baustelle. */
  transportLeistung: 50,
  /** Säcke je Person und Stunde beim Verlegen. */
  verbauLeistung: 60,
  /** Ladevolumen einer LKW-Fuhre Sand in m³. */
  fuhrenVolumen: 8,
};

/** Ab hier trägt ein einreihiger Wall den Wasserdruck nicht mehr. */
const EINFACH_MAX_HOEHE = 0.5;

/** Darüber ist ein Sandsackbauwerk kein Sandsackbauwerk mehr. */
const HOEHE_UNGEWOEHNLICH = 2;

/** Darüber lässt sich der Sack nicht mehr binden, das verlegte Maß gilt nicht. */
const FUELLGRAD_MAX = 80;

/** Zuschlag auf die Folienlänge für die Überlappung der Bahnen. */
const FOLIE_UEBERLAPPUNG = 1.1;

/** Fußsicherung und Auflage auf der Krone, in m Bahnbreite. */
const FOLIE_ZUSCHLAG = 1;

export type DammWarning =
  /** Die Linie hat keine Länge — es ist noch nichts gezeichnet. */
  | 'keineStrecke'
  /** Einreihiger Wall über der standsicheren Höhe. */
  | 'einfachZuHoch'
  /** Für Sandsäcke zu hoch geplant. */
  | 'hoeheUngewoehnlich'
  /** Füllgrad, bei dem das verlegte Maß nicht mehr gilt. */
  | 'fuellgradHoch'
  /** Das Freibord ist höher als der Damm — es bleibt kein Wasserstand übrig. */
  | 'freibordUeberHoehe'
  /** Keine Kräfte eingetragen, also auch keine Bauzeit. */
  | 'keinPersonal'
  /** Mit den eingetragenen Kräften ist die Zielzeit nicht zu halten. */
  | 'zielzeitVerfehlt';

export interface DammQuerschnitt {
  /** Fläche in m². */
  flaeche: number;
  basisbreite: number;
  kronenbreite: number;
}

/**
 * Der Querschnitt des Dammes.
 *
 * Die Krone ist immer eine Sacklänge breit: Weniger lässt sich nicht verlegen.
 * Beim Pyramidenstapel wächst die Basis mit der Höhe — das ist die Böschung, und
 * sie ist der Grund, warum ein doppelt so hoher Damm mehr als doppelt so viele
 * Säcke braucht.
 */
export function dammQuerschnitt(
  bauweise: DammBauweise,
  hoehe: number,
  kronenbreite: number,
  boeschung: number
): DammQuerschnitt {
  const h = Math.max(0, hoehe);
  switch (bauweise) {
    case 'einfach':
      return {
        flaeche: kronenbreite * h,
        basisbreite: kronenbreite,
        kronenbreite,
      };
    case 'dammbalken': {
      // Der Ersatz für einen Dammbalken steckt in einer Öffnung und wird von
      // ihren Wangen gehalten — er braucht keine Böschung, aber zwei Sacklängen
      // Tiefe, damit er dicht wird und nicht kippt.
      const breite = 2 * kronenbreite;
      return { flaeche: breite * h, basisbreite: breite, kronenbreite: breite };
    }
    default: {
      const basisbreite = Math.max(boeschung * h, kronenbreite);
      return {
        flaeche: ((kronenbreite + basisbreite) / 2) * h,
        basisbreite,
        kronenbreite,
      };
    }
  }
}

export interface SandsackInput {
  /** Dammlänge in m. */
  laenge: number;
  /** Dammhöhe in m. */
  hoehe: number;
  bauweise: DammBauweise;
  boeschung: number;
  format: SackFormat;
  /** Füllgrad in %. */
  fuellgrad: number;
  /** Schüttdichte in t/m³. */
  sandDichte: number;
  /** Sackreserve in %. */
  reserve: number;
  personal: number;
  /** Gewünschte Fertigstellungszeit in h. */
  zielzeit: number;
  fuellLeistung: number;
  transportLeistung: number;
  verbauLeistung: number;
  fuhrenVolumen: number;
  freibord: number;
}

export interface PersonalVerteilung {
  fuellen: number;
  transport: number;
  verbauen: number;
}

export interface SandsackBedarf {
  querschnitt: DammQuerschnitt;
  /** Verbautes Volumen in m³. */
  dammVolumen: number;
  /** Anzahl Säcke für das Bauwerk. */
  saecke: number;
  saeckeProMeter: number;
  /** Anzahl Säcke inklusive Reserve — die Zahl für die Nachforderung. */
  saeckeBestellen: number;
  /** Sandbedarf in m³. */
  sandVolumen: number;
  /** Sandbedarf in t. */
  sandMasse: number;
  /** Gewicht eines gefüllten Sackes in kg. */
  masseJeSack: number;
  fuhren: number;
  /** Folienbedarf in m². */
  folieFlaeche: number;
  /** Lagen Säcke übereinander. */
  lagen: number;
  personenstunden: number;
  stunden: { fuellen: number; transport: number; verbauen: number };
  /** Bauzeit in h mit dem eingetragenen Personal. */
  bauzeit: number;
  /** Kräfte, um die Zielzeit zu halten. */
  personalFuerZielzeit: number;
  personalVerteilung: PersonalVerteilung;
  /** Wasserstand in m, den der Damm mit dem Freibord hält. */
  wasserstand: number;
  warnings: DammWarning[];
}

/**
 * Verteilt die Kräfte auf die drei Tätigkeiten, gewichtet nach dem
 * Arbeitsanfall.
 *
 * Nach größten Resten, damit die Summe die eingetragene Zahl trifft: Eine
 * Verteilung, die 11 von 12 Kräften nennt, wird an der Einsatzstelle als
 * Rechenfehler gelesen — und ist es auch.
 */
function verteilePersonal(
  personal: number,
  anteile: number[]
): number[] {
  const summe = anteile.reduce((a, b) => a + b, 0);
  if (personal <= 0 || summe <= 0) return anteile.map(() => 0);

  const exakt = anteile.map((anteil) => (anteil / summe) * personal);
  const abgerundet = exakt.map(Math.floor);
  let rest = personal - abgerundet.reduce((a, b) => a + b, 0);
  const reihenfolge = exakt
    .map((wert, index) => ({ index, rest: wert - Math.floor(wert) }))
    .sort((a, b) => b.rest - a.rest);
  for (const { index } of reihenfolge) {
    if (rest <= 0) break;
    abgerundet[index] += 1;
    rest -= 1;
  }
  return abgerundet;
}

export function sandsackBedarf(input: SandsackInput): SandsackBedarf {
  const warnings: DammWarning[] = [];

  const querschnitt = dammQuerschnitt(
    input.bauweise,
    input.hoehe,
    input.format.laenge,
    input.boeschung
  );
  const verlegtesVolumen =
    input.format.laenge * input.format.breite * input.format.hoehe;
  const sandJeSack = (input.fuellgrad / 100) * input.format.fuellvolumen;

  const dammVolumen = querschnitt.flaeche * Math.max(0, input.laenge);
  const saecke =
    verlegtesVolumen > 0 ? Math.ceil(dammVolumen / verlegtesVolumen) : 0;
  const sandVolumen = saecke * sandJeSack;

  const stunden = {
    fuellen: input.fuellLeistung > 0 ? saecke / input.fuellLeistung : 0,
    transport:
      input.transportLeistung > 0 ? saecke / input.transportLeistung : 0,
    verbauen: input.verbauLeistung > 0 ? saecke / input.verbauLeistung : 0,
  };
  const personenstunden =
    stunden.fuellen + stunden.transport + stunden.verbauen;
  const bauzeit = input.personal > 0 ? personenstunden / input.personal : 0;

  const [fuellen, transport, verbauen] = verteilePersonal(
    Math.round(input.personal),
    [stunden.fuellen, stunden.transport, stunden.verbauen]
  );

  if (input.laenge <= 0) warnings.push('keineStrecke');
  if (input.bauweise === 'einfach' && input.hoehe > EINFACH_MAX_HOEHE) {
    warnings.push('einfachZuHoch');
  }
  if (input.hoehe > HOEHE_UNGEWOEHNLICH) warnings.push('hoeheUngewoehnlich');
  if (input.fuellgrad > FUELLGRAD_MAX) warnings.push('fuellgradHoch');
  if (input.freibord >= input.hoehe) warnings.push('freibordUeberHoehe');
  if (input.personal <= 0) {
    warnings.push('keinPersonal');
  } else if (input.zielzeit > 0 && bauzeit > input.zielzeit) {
    warnings.push('zielzeitVerfehlt');
  }

  return {
    querschnitt,
    dammVolumen,
    saecke,
    saeckeProMeter: input.laenge > 0 ? saecke / input.laenge : 0,
    saeckeBestellen: Math.ceil(saecke * (1 + input.reserve / 100)),
    sandVolumen,
    sandMasse: sandVolumen * input.sandDichte,
    masseJeSack: sandJeSack * input.sandDichte * 1000,
    fuhren:
      input.fuhrenVolumen > 0
        ? Math.ceil(sandVolumen / input.fuhrenVolumen)
        : 0,
    // Eine Bahn deckt die Wasserseite, die Krone und die Fußsicherung ab. Die
    // Böschung bleibt außen vor: Die Folie liegt auf der Wasserseite, nicht auf
    // beiden.
    folieFlaeche:
      Math.max(0, input.laenge) *
      FOLIE_UEBERLAPPUNG *
      (2 * Math.max(0, input.hoehe) + FOLIE_ZUSCHLAG),
    lagen:
      input.format.hoehe > 0
        ? Math.ceil(Math.max(0, input.hoehe) / input.format.hoehe)
        : 0,
    personenstunden,
    stunden,
    bauzeit,
    personalFuerZielzeit:
      input.zielzeit > 0 ? Math.ceil(personenstunden / input.zielzeit) : 0,
    personalVerteilung: { fuellen, transport, verbauen },
    wasserstand: Math.max(0, input.hoehe - input.freibord),
    warnings,
  };
}

/** Die aufgefüllten Parameter einer Dammlinie. */
export interface DammbauParams {
  dammHoehe: number;
  freibord: number;
  dammBauweise: DammBauweise;
  dammBoeschung: number;
  sackFormat: string;
  sackFuellgrad: number;
  sandDichte: number;
  dammReserve: number;
  dammPersonal: number;
  dammZielzeit: number;
  fuellLeistung: number;
  transportLeistung: number;
  verbauLeistung: number;
  fuhrenVolumen: number;
}

/** Eine Zahl aus dem Feld, oder die Vorbelegung. Nur endliche Werte zählen. */
const numberOr = (value: number | undefined, fallback: number): number =>
  typeof value === 'number' && Number.isFinite(value) ? value : fallback;

const positiveOr = (value: number | undefined, fallback: number): number =>
  Math.max(0, numberOr(value, fallback));

export function dammbauParams(item: Line): DammbauParams {
  const format = item.sackFormat;
  const bauweise = item.dammBauweise;
  return {
    dammHoehe: positiveOr(item.dammHoehe, DAMM_DEFAULTS.dammHoehe),
    freibord: positiveOr(item.freibord, DAMM_DEFAULTS.freibord),
    dammBauweise:
      bauweise && DAMM_BAUWEISEN.includes(bauweise)
        ? bauweise
        : DAMM_DEFAULTS.dammBauweise,
    dammBoeschung: positiveOr(
      item.dammBoeschung,
      DAMM_DEFAULTS.dammBoeschung
    ),
    sackFormat:
      format && SACK_FORMATE[format] ? format : DAMM_DEFAULTS.sackFormat,
    sackFuellgrad: positiveOr(
      item.sackFuellgrad,
      DAMM_DEFAULTS.sackFuellgrad
    ),
    sandDichte: positiveOr(item.sandDichte, DAMM_DEFAULTS.sandDichte),
    dammReserve: positiveOr(item.dammReserve, DAMM_DEFAULTS.dammReserve),
    dammPersonal: positiveOr(item.dammPersonal, DAMM_DEFAULTS.dammPersonal),
    dammZielzeit: positiveOr(item.dammZielzeit, DAMM_DEFAULTS.dammZielzeit),
    fuellLeistung: positiveOr(
      item.fuellLeistung,
      DAMM_DEFAULTS.fuellLeistung
    ),
    transportLeistung: positiveOr(
      item.transportLeistung,
      DAMM_DEFAULTS.transportLeistung
    ),
    verbauLeistung: positiveOr(
      item.verbauLeistung,
      DAMM_DEFAULTS.verbauLeistung
    ),
    fuhrenVolumen: positiveOr(
      item.fuhrenVolumen,
      DAMM_DEFAULTS.fuhrenVolumen
    ),
  };
}

/** Ob der Sandsackrechner an dieser Linie aktiv ist. */
export const isDammbauEnabled = (item: Line): boolean =>
  item.dammbau === 'true';

export interface DammbauView {
  params: DammbauParams;
  /** Länge der gezeichneten Linie in m. */
  laenge: number;
  format: SackFormat;
  bedarf: SandsackBedarf;
}

/**
 * Das Ergebnis für eine Dammlinie, oder `undefined`, wenn der Rechner nicht
 * aktiv ist.
 *
 * `overrides` erlaubt dem Panel, mit geänderten Werten zu rechnen, ohne sie
 * vorher zu speichern — das ist der Zweck des Reglers: sehen, wie die Sackzahl
 * auf 20 cm mehr Dammhöhe reagiert.
 */
export function dammbauView(
  item: Line,
  overrides: Partial<DammbauParams> = {}
): DammbauView | undefined {
  if (!isDammbauEnabled(item)) return undefined;

  const params = { ...dammbauParams(item), ...overrides };
  const format = SACK_FORMATE[params.sackFormat] ?? SACK_FORMATE['30x60'];
  const laenge = calculateDistance(connectionDisplayPositions(item));

  return {
    params,
    laenge,
    format,
    bedarf: sandsackBedarf({
      laenge,
      hoehe: params.dammHoehe,
      bauweise: params.dammBauweise,
      boeschung: params.dammBoeschung,
      format,
      fuellgrad: params.sackFuellgrad,
      sandDichte: params.sandDichte,
      reserve: params.dammReserve,
      personal: params.dammPersonal,
      zielzeit: params.dammZielzeit,
      fuellLeistung: params.fuellLeistung,
      transportLeistung: params.transportLeistung,
      verbauLeistung: params.verbauLeistung,
      fuhrenVolumen: params.fuhrenVolumen,
      freibord: params.freibord,
    }),
  };
}

const round = (value: number, digits = 1): number =>
  Math.round(value * 10 ** digits) / 10 ** digits;

/**
 * Die Zeile für Kartenpopup und Elementliste, oder `undefined` ohne aktiven
 * Rechner bzw. ohne gezeichnete Strecke.
 */
export function dammbauSummary(item: Line): string | undefined {
  const view = dammbauView(item);
  if (!view || view.bedarf.saecke <= 0) return undefined;
  return `Damm ${round(view.params.dammHoehe, 2)} m: ${
    view.bedarf.saecke
  } Sandsäcke, ${Math.round(view.bedarf.sandMasse)} t Sand`;
}
