'use client';

import type { Line } from '../../../firebase/firestore';
import { calculateDistance } from '../connection/distance';
import { connectionDisplayPositions } from '../connection/streetRouting';
import {
  fuellLeistungTrupp,
  transportLeistung as transportLeistungFuerWeite,
  TRANSPORT_WEITE_BASIS,
} from './fuellLeistung';
import {
  VERLEGE_LEISTUNG,
  inTabelle,
  saeckeJeMeter,
} from './saeckeJeMeter';

/**
 * Sandsackbedarf für einen Dammabschnitt.
 *
 * Reine Arithmetik — kein Netzaufruf, kein Cache. Die Dammlinie liegt auf der
 * Karte, ihre Länge ist bekannt; alles andere kommt aus den Tabellen der
 * Lehrunterlage.
 *
 * **Quelle:** „Feuerwehr und Hochwasser", Abschnitt 3.3 „Sandsackanwendung und
 * Dammverteidigung", Lehrunterlage `LU_TE3_Gesamt_Teil1_20200130_v03`, S. 34–37.
 * Welche Zahl von welcher Seite kommt, steht in docs/dammbau-sandsaecke.md. Das
 * ist keine Formsache: Die Sackzahl entscheidet über die Nachforderung von
 * Material und Personal, und eine Zahl, die niemand nachprüfen kann, ist im
 * Führungsvorgang wertlos.
 */

export type DammBauweise =
  /** Pyramidenstapel — die Bauweise der Tabelle. */
  | 'pyramide'
  /** Sandsacknotdamm: „ungefähr die Hälfte der Säcke und die Hälfte der Zeit". */
  | 'notdamm'
  /** Einreihiger Wall, für flache Höhen und zum Umleiten. */
  | 'einfach'
  /** Abdichten einer Öffnung — Tür, Tor, Hofeinfahrt. */
  | 'dammbalken';

export const DAMM_BAUWEISEN: DammBauweise[] = [
  'pyramide',
  'notdamm',
  'einfach',
  'dammbalken',
];

/** Ob die Bauweise ihren Bedarf aus der Verlegetabelle nimmt. */
export const nachTabelle = (bauweise: DammBauweise): boolean =>
  bauweise === 'pyramide' || bauweise === 'notdamm';

/**
 * „Beim Aufbau eines Sandsacknotdammes kann ungefähr von der Hälfte der
 * Sandsäcke und der Hälfte der Zeit ausgegangen werden." (S. 37)
 *
 * Die halbe Zeit ergibt sich von selbst: Die Verlegezeit hängt an der Sackzahl.
 */
const NOTDAMM_FAKTOR = 0.5;

/**
 * Ein Sandsackformat.
 *
 * Die Unterlage nennt „30x60 (40x70) cm" mit **demselben** Gewicht von ca. 15 kg
 * trocken. Der größere Sack nimmt also nicht mehr Sand auf, er wird nur weniger
 * voll — und liegt dafür flacher und formschlüssiger. Deshalb steht hier je
 * Format das Volumen des **randvollen** Sackes; wie viel hineinkommt, sagt der
 * Füllgrad.
 */
export interface SackFormat {
  /** Volumen des randvollen Sackes in m³. */
  fuellvolumen: number;
  /** Verlegte Länge quer zur Dammachse in m — bestimmt die Kronenbreite. */
  laenge: number;
  /** Verlegte Breite längs der Dammachse in m. */
  breite: number;
}

/**
 * Die Formate nach dem leeren Sackmaß in cm.
 *
 * Das Standardformat ist auf die Unterlage kalibriert: 8 Säcke je m² verlegter
 * Fläche (S. 37) sind 0,125 m² je Sack, hier 0,50 × 0,25 m. Das Füllvolumen
 * folgt aus dem Sackgewicht: 15 kg trocken bei 1,5 t/m³ sind 0,010 m³ Sand, und
 * das ist bei „max. 2/3 des Volumens" (S. 36) ein randvolles Volumen von
 * 0,015 m³. Das große Format ist im Verhältnis der leeren Sackflächen skaliert.
 */
export const SACK_FORMATE: Record<string, SackFormat> = {
  '30x60': { fuellvolumen: 0.015, laenge: 0.5, breite: 0.25 },
  '40x70': { fuellvolumen: 0.0233, laenge: 0.58, breite: 0.335 },
};

export const SACK_FORMAT_KEYS = Object.keys(SACK_FORMATE);

/**
 * Verlegtes Volumen je m³ Sandinhalt.
 *
 * Aus der Unterlage: 80 Säcke je m³ (S. 37) bei einem Sandinhalt von 0,010 m³ je
 * Sack sind 0,0125 m³ verlegt — ein Viertel mehr als der Inhalt. Das ist der
 * Fugenanteil eines verlegten und festgetretenen Sandsackverbaus.
 *
 * Deshalb ist das verlegte Volumen **keine** Eigenschaft des Formats, sondern
 * folgt aus dem Inhalt: Ein voller gefüllter Sack nimmt mehr Raum ein.
 */
const PACKUNGSFAKTOR = 1.25;

/** „30x60 (40x70) cm trocken: ca. 15 kg (nass: ca. 20 kg)" (S. 35). */
const NASS_FAKTOR = 20 / 15;

/** „Sandsäcke pro Palette 50 Stück", „Gewicht pro Palette ca. 1000 kg" (S. 37). */
export const SAECKE_JE_PALETTE = 50;
export const PALETTE_MASSE_T = 1;

/**
 * Darüber trägt ein einreihiger Wall nicht mehr.
 *
 * Die Unterlage zeigt einreihige und zweireihige Anordnungen bis 30 cm Höhe
 * (S. 35); für 50 cm und 100 cm nur noch Stapel.
 */
const EINFACH_MAX_HOEHE = 0.3;

/** Darüber lässt sich der Sack nicht mehr binden, das verlegte Maß gilt nicht. */
const FUELLGRAD_MAX = 67;

/** Darüber trägt niemand den Sack mehr — nass gerechnet. */
const MASSE_MAX_KG = 25;

/** Zuschlag auf die Folienlänge für die Überlappung der Bahnen. */
const FOLIE_UEBERLAPPUNG = 1.1;

/** Fußsicherung und Auflage auf der Krone, in m Bahnbreite. */
const FOLIE_ZUSCHLAG = 1;

/** Obergrenze der Personalsuche — weit über jeder Lage, nur gegen Endlosschleifen. */
const MAX_PERSONAL = 1000;

export type DammWarning =
  /** Die Linie hat keine Länge — es ist noch nichts gezeichnet. */
  | 'keineStrecke'
  /** Einreihiger Wall über der Höhe, für die die Unterlage ihn zeigt. */
  | 'einfachZuHoch'
  /** Über der letzten Zeile der Verlegetabelle — extrapoliert. */
  | 'ueberTabelle'
  /** Füllgrad über „max. 2/3 des Volumens". */
  | 'fuellgradHoch'
  /** Der gefüllte Sack ist nass zu schwer, um getragen zu werden. */
  | 'sackZuSchwer'
  /** Das Freibord ist höher als der Damm — es bleibt kein Wasserstand übrig. */
  | 'freibordUeberHoehe'
  /** Keine Kräfte eingetragen, also auch keine Bauzeit. */
  | 'keinPersonal'
  /** Mit den eingetragenen Kräften ist die Zielzeit nicht zu halten. */
  | 'zielzeitVerfehlt'
  /** Der Bedarf ist von Hand über die Böschung gerechnet, nicht aus der Tabelle. */
  | 'geometrieStattTabelle';

export interface DammQuerschnitt {
  /** Fläche in m². */
  flaeche: number;
  basisbreite: number;
  kronenbreite: number;
}

/**
 * Der Querschnitt eines Dammes aus seiner Böschung.
 *
 * Nur für die Bauweisen, die **nicht** in der Verlegetabelle stehen, und für den
 * Fall, dass die Böschung von Hand gesetzt ist. Beim Pyramidenstapel kommt der
 * Querschnitt umgekehrt aus der Sackzahl der Tabelle — siehe
 * `querschnittAusSaecken`.
 *
 * Die Krone ist immer eine Sacklänge breit: Weniger lässt sich nicht verlegen.
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

/**
 * Der Querschnitt, den die Sackzahl der Tabelle bedeutet.
 *
 * Umgekehrt gerechnet: Die Tabelle sagt, wie viele Säcke je Meter gebraucht
 * werden; mit dem verlegten Volumen je Sack ergibt das eine Fläche, und daraus
 * die Basisbreite eines Trapezes mit einer Sacklänge Krone.
 *
 * Damit stimmen Bild und Zahl aus **einer** Quelle: Was gezeichnet wird, ist der
 * Damm, für den die Tabelle ihre Säcke nennt. Bei 1 m Höhe sind das
 * 120 Säcke/m ÷ 80 Säcke/m³ = 1,5 m² und damit 2,5 m Basis.
 */
export function querschnittAusSaecken(
  saeckeProMeter: number,
  hoehe: number,
  kronenbreite: number,
  verlegtesVolumen: number
): DammQuerschnitt {
  const flaeche = saeckeProMeter * verlegtesVolumen;
  if (!(hoehe > 0)) {
    return { flaeche: 0, basisbreite: kronenbreite, kronenbreite };
  }
  return {
    flaeche,
    basisbreite: Math.max((2 * flaeche) / hoehe - kronenbreite, kronenbreite),
    kronenbreite,
  };
}

export interface PersonalVerteilung {
  fuellen: number;
  transport: number;
  verbauen: number;
}

export interface Leistungswerte {
  /** Säcke je Person und Stunde beim Füllen. */
  fuellen: number;
  /** Säcke je Person und Stunde beim Transport. */
  transport: number;
  /** Säcke je Person und Stunde beim Verlegen. */
  verbauen: number;
}

export interface Arbeitsaufwand {
  leistung: Leistungswerte;
  /** Personenstunden je Sack, über alle drei Tätigkeiten. */
  personenstundenJeSack: number;
  verteilung: PersonalVerteilung;
}

/**
 * Verteilt die Kräfte auf die drei Tätigkeiten, gewichtet nach dem
 * Arbeitsanfall.
 *
 * Nach größten Resten, damit die Summe die eingetragene Zahl trifft: Eine
 * Verteilung, die 11 von 12 Kräften nennt, wird an der Einsatzstelle als
 * Rechenfehler gelesen — und ist es auch.
 */
function verteilePersonal(personal: number, anteile: number[]): number[] {
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

/**
 * Der Arbeitsaufwand je Sack und die Aufteilung der Kräfte.
 *
 * Gerechnet wird in **Personenstunden**: Füllen, Tragen und Verlegen kosten je
 * Sack eine bestimmte Zeit, und die Mannschaft teilt sich nach dem Arbeitsanfall
 * auf. Die Probe ist die Unterlage selbst: Bei 12.000 Säcken und 10 Helfern
 * entfallen 12.000 ÷ 80 ÷ 10 = 15 h aufs Verlegen — genau die 9 Minuten je Meter
 * mal 100 Meter aus der Verlegetabelle.
 *
 * Die **Füllleistung hängt an der Truppgröße**: Ein Zweiertrupp bringt 30 Säcke
 * je Person und Stunde, ein Zehnertrupp 50. Nachgeschlagen wird deshalb mit der
 * ganzen Mannschaft — das ist das „Team", von dem die Tabelle spricht. Damit
 * sinkt der Aufwand je Sack, wenn mehr Kräfte da sind, und die Bauzeit fällt
 * schneller als bloß umgekehrt proportional.
 */
export function arbeitsaufwand(
  personal: number,
  quellen: {
    /** Füllleistung je Person und Stunde für eine Truppgröße. */
    fuellenJePerson: (personen: number) => number;
    transport: number;
    verbauen: number;
  }
): Arbeitsaufwand {
  const kraefte = Math.max(0, Math.round(personal));
  const leistung: Leistungswerte = {
    fuellen: quellen.fuellenJePerson(kraefte),
    transport: quellen.transport,
    verbauen: quellen.verbauen,
  };

  const zeiten = {
    fuellen: leistung.fuellen > 0 ? 1 / leistung.fuellen : 0,
    transport: leistung.transport > 0 ? 1 / leistung.transport : 0,
    verbauen: leistung.verbauen > 0 ? 1 / leistung.verbauen : 0,
  };
  const [fuellen, transport, verbauen] = verteilePersonal(kraefte, [
    zeiten.fuellen,
    zeiten.transport,
    zeiten.verbauen,
  ]);

  return {
    leistung,
    personenstundenJeSack:
      zeiten.fuellen + zeiten.transport + zeiten.verbauen,
    verteilung: { fuellen, transport, verbauen },
  };
}

export interface SandsackInput {
  /** Dammlänge in m. */
  laenge: number;
  /** Dammhöhe in m. */
  hoehe: number;
  bauweise: DammBauweise;
  /**
   * Basisbreite je m Höhe. Nur gesetzt, wenn von Hand gerechnet werden soll —
   * dann gilt die Geometrie und nicht die Tabelle.
   */
  boeschung?: number;
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
  /** Füllhilfe im Einsatz. */
  trichter: boolean;
  /** Säcke werden zugebunden. */
  roedeln: boolean;
  /** Trageweite der Sandsackkette in m. */
  transportWeite: number;
  /** Nutzlast eines LKW in t. */
  lkwNutzlast: number;
  freibord: number;
  /** Füllleistung je Person und Stunde, wenn von Hand gesetzt. */
  fuellLeistung?: number;
  /** Transportleistung je Person und Stunde, wenn von Hand gesetzt. */
  transportLeistung?: number;
  /** Verlegeleistung je Person und Stunde, wenn von Hand gesetzt. */
  verbauLeistung?: number;
}

export interface SandsackBedarf {
  querschnitt: DammQuerschnitt;
  /** Ob der Bedarf aus der Verlegetabelle kommt oder aus der Böschung. */
  saeckeSource: 'tabelle' | 'geometrie';
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
  /** Gewicht eines gefüllten Sackes in kg, trocken. */
  masseJeSack: number;
  /** Gewicht eines gefüllten Sackes in kg, nass. */
  masseJeSackNass: number;
  /** Verlegtes Volumen eines Sackes in m³. */
  verlegtesVolumen: number;
  /** Verlegte Säcke je m³ — die Kennzahl der Unterlage. */
  saeckeJeKubikmeter: number;
  paletten: number;
  /** LKW-Fuhren für die gefüllten Säcke auf Paletten. */
  lkwFuhrenSaecke: number;
  /** LKW-Fuhren für den losen Sand. */
  lkwFuhrenSand: number;
  /** Folienbedarf in m². */
  folieFlaeche: number;
  /** Lagen Säcke übereinander. */
  lagen: number;
  /** Wirksame Leistungswerte je Person und Stunde. */
  leistung: Leistungswerte;
  /** Personenstunden je Sack über alle drei Tätigkeiten. */
  personenstundenJeSack: number;
  /** Personenstunden für den ganzen Abschnitt. */
  personenstunden: number;
  /** Säcke je Stunde, die die Mannschaft schafft. */
  durchsatz: number;
  /** Bauzeit in h mit dem eingetragenen Personal. */
  bauzeit: number;
  /** Kräfte, um die Zielzeit zu halten. */
  personalFuerZielzeit: number;
  personalVerteilung: PersonalVerteilung;
  /** Helfer für die Sandsackkette — 1 je Meter Trageweite. */
  kettenHelfer: number;
  /** Wasserstand in m, den der Damm mit dem Freibord hält. */
  wasserstand: number;
  warnings: DammWarning[];
}

export function sandsackBedarf(input: SandsackInput): SandsackBedarf {
  const warnings: DammWarning[] = [];

  const sandJeSack = (input.fuellgrad / 100) * input.format.fuellvolumen;
  const verlegtesVolumen = sandJeSack * PACKUNGSFAKTOR;
  const grundflaeche = input.format.laenge * input.format.breite;
  const lagenHoehe = grundflaeche > 0 ? verlegtesVolumen / grundflaeche : 0;

  // Die Tabelle gilt für den Stapel. Von Hand gesetzte Böschung und die
  // Bauweisen, die die Unterlage nicht mit Sackzahlen belegt, gehen über die
  // Geometrie.
  const ausTabelle =
    nachTabelle(input.bauweise) && input.boeschung === undefined;

  const querschnitt = ausTabelle
    ? querschnittAusSaecken(
        saeckeJeMeter(input.hoehe) *
          (input.bauweise === 'notdamm' ? NOTDAMM_FAKTOR : 1),
        input.hoehe,
        input.format.laenge,
        verlegtesVolumen
      )
    : dammQuerschnitt(
        input.bauweise,
        input.hoehe,
        input.format.laenge,
        input.boeschung ?? 3
      );

  const saeckeProMeterRoh = ausTabelle
    ? saeckeJeMeter(input.hoehe) *
      (input.bauweise === 'notdamm' ? NOTDAMM_FAKTOR : 1)
    : verlegtesVolumen > 0
      ? querschnitt.flaeche / verlegtesVolumen
      : 0;

  const laenge = Math.max(0, input.laenge);
  const saecke = Math.ceil(saeckeProMeterRoh * laenge);
  const sandVolumen = saecke * sandJeSack;
  const sandMasse = sandVolumen * input.sandDichte;

  // Wirksame Leistungswerte: aus der Unterlage, sofern nicht von Hand gesetzt.
  const quellen = {
    fuellenJePerson: (personen: number) =>
      input.fuellLeistung ??
      (personen > 0
        ? fuellLeistungTrupp(personen, {
            trichter: input.trichter,
            roedeln: input.roedeln,
          }) / personen
        : 0),
    transport:
      input.transportLeistung ??
      transportLeistungFuerWeite(input.transportWeite),
    verbauen: input.verbauLeistung ?? VERLEGE_LEISTUNG,
  };

  const aufwand = arbeitsaufwand(input.personal, quellen);
  const personenstunden = saecke * aufwand.personenstundenJeSack;
  const bauzeit = input.personal > 0 ? personenstunden / input.personal : 0;
  const durchsatz = bauzeit > 0 ? saecke / bauzeit : 0;

  // Die kleinste Mannschaft, die die Zielzeit hält. Die Bauzeit fällt monoton
  // mit dem Personal — die Füllleistung je Person steigt mit der Truppgröße —,
  // also trägt die erste Mannschaft, die es schafft.
  let personalFuerZielzeit = 0;
  if (input.zielzeit > 0 && saecke > 0) {
    for (let p = 1; p <= MAX_PERSONAL; p += 1) {
      const proBe = arbeitsaufwand(p, quellen);
      if ((saecke * proBe.personenstundenJeSack) / p <= input.zielzeit) {
        personalFuerZielzeit = p;
        break;
      }
    }
  }

  if (laenge <= 0) warnings.push('keineStrecke');
  if (input.bauweise === 'einfach' && input.hoehe > EINFACH_MAX_HOEHE) {
    warnings.push('einfachZuHoch');
  }
  if (ausTabelle && input.hoehe > 0 && !inTabelle(input.hoehe)) {
    warnings.push('ueberTabelle');
  }
  if (!ausTabelle && nachTabelle(input.bauweise)) {
    warnings.push('geometrieStattTabelle');
  }
  if (input.fuellgrad > FUELLGRAD_MAX) warnings.push('fuellgradHoch');
  const masseJeSack = sandJeSack * input.sandDichte * 1000;
  const masseJeSackNass = masseJeSack * NASS_FAKTOR;
  if (masseJeSackNass > MASSE_MAX_KG) warnings.push('sackZuSchwer');
  if (input.freibord >= input.hoehe) warnings.push('freibordUeberHoehe');
  if (input.personal <= 0) {
    warnings.push('keinPersonal');
  } else if (input.zielzeit > 0 && bauzeit > input.zielzeit) {
    warnings.push('zielzeitVerfehlt');
  }

  const paletten = Math.ceil(saecke / SAECKE_JE_PALETTE);

  return {
    querschnitt,
    saeckeSource: ausTabelle ? 'tabelle' : 'geometrie',
    dammVolumen: querschnitt.flaeche * laenge,
    saecke,
    saeckeProMeter: laenge > 0 ? saecke / laenge : 0,
    saeckeBestellen: Math.ceil(saecke * (1 + input.reserve / 100)),
    sandVolumen,
    sandMasse,
    masseJeSack,
    masseJeSackNass,
    verlegtesVolumen,
    saeckeJeKubikmeter: verlegtesVolumen > 0 ? 1 / verlegtesVolumen : 0,
    paletten,
    lkwFuhrenSaecke:
      input.lkwNutzlast > 0
        ? Math.ceil((paletten * PALETTE_MASSE_T) / input.lkwNutzlast)
        : 0,
    lkwFuhrenSand:
      input.lkwNutzlast > 0 ? Math.ceil(sandMasse / input.lkwNutzlast) : 0,
    // Eine Bahn deckt die Wasserseite, die Krone und die Fußsicherung ab. Die
    // Böschung bleibt außen vor: Die Folie liegt auf der Wasserseite, nicht auf
    // beiden.
    folieFlaeche:
      laenge *
      FOLIE_UEBERLAPPUNG *
      (2 * Math.max(0, input.hoehe) + FOLIE_ZUSCHLAG),
    lagen: lagenHoehe > 0 ? Math.ceil(Math.max(0, input.hoehe) / lagenHoehe) : 0,
    leistung: aufwand.leistung,
    personenstundenJeSack: aufwand.personenstundenJeSack,
    personenstunden,
    durchsatz,
    bauzeit,
    personalFuerZielzeit,
    personalVerteilung: aufwand.verteilung,
    kettenHelfer: Math.max(0, Math.ceil(input.transportWeite)),
    wasserstand: Math.max(0, input.hoehe - input.freibord),
    warnings,
  };
}

/** Vorbelegungen, alle belegt — Herkunft je Wert in docs/dammbau-sandsaecke.md. */
export const DAMM_DEFAULTS = {
  /** Geplante Dammhöhe in m. */
  dammHoehe: 0.8,
  /** Sicherheitszuschlag über dem erwarteten Wasserstand in m. */
  freibord: 0.3,
  dammBauweise: 'pyramide' as DammBauweise,
  sackFormat: '30x60',
  /** Füllgrad in %. „Sandsäcke bis max. 2/3 ihres Volumens befüllen" (S. 36). */
  sackFuellgrad: 66,
  /** Schüttdichte des Sandes in t/m³. */
  sandDichte: 1.5,
  /** Sackreserve in % für Bruch und Fehlfüllung. */
  dammReserve: 10,
  /** Eingesetzte Kräfte. */
  dammPersonal: 12,
  /** Gewünschte Fertigstellungszeit in h. */
  dammZielzeit: 4,
  /** Füllhilfe im Einsatz. Ohne, bis eine da ist. */
  fuellTrichter: false,
  /**
   * Säcke zubinden. Für einen Damm **nicht** — die Unterlage sagt das
   * ausdrücklich, nicht zugebundene Säcke passen sich Unebenheiten besser an.
   */
  saeckeRoedeln: false,
  /** Trageweite der Kette in m — die Weite, für die die Unterlage 80 Säcke nennt. */
  transportWeite: TRANSPORT_WEITE_BASIS,
  /** Nutzlast eines LKW in t. „Ladekapazität LKW 10 t" (S. 37). */
  lkwNutzlast: 10,
};

/** Die aufgefüllten Parameter einer Dammlinie. */
export interface DammbauParams {
  dammHoehe: number;
  freibord: number;
  dammBauweise: DammBauweise;
  /**
   * Basisbreite je m Höhe. `undefined` heißt: aus der Verlegetabelle rechnen.
   *
   * Ein gesetzter Wert ist die Handeingabe und schaltet auf die Geometrie um —
   * dasselbe Muster wie die Handeingabe des Höhenunterschieds bei der
   * Löschwasserförderung.
   */
  dammBoeschung?: number;
  sackFormat: string;
  sackFuellgrad: number;
  sandDichte: number;
  dammReserve: number;
  dammPersonal: number;
  dammZielzeit: number;
  fuellTrichter: boolean;
  saeckeRoedeln: boolean;
  transportWeite: number;
  lkwNutzlast: number;
  fuellLeistung?: number;
  transportLeistung?: number;
  verbauLeistung?: number;
}

/** Eine Zahl aus dem Feld, oder die Vorbelegung. Nur endliche Werte zählen. */
const numberOr = (value: number | undefined, fallback: number): number =>
  typeof value === 'number' && Number.isFinite(value) ? value : fallback;

const positiveOr = (value: number | undefined, fallback: number): number =>
  Math.max(0, numberOr(value, fallback));

/** Ein gesetzter Wert, oder `undefined`. Unbrauchbare Eingaben zählen nicht. */
const optionalNumber = (value: number | undefined): number | undefined =>
  typeof value === 'number' && Number.isFinite(value) && value > 0
    ? value
    : undefined;

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
    dammBoeschung: optionalNumber(item.dammBoeschung),
    sackFormat:
      format && SACK_FORMATE[format] ? format : DAMM_DEFAULTS.sackFormat,
    sackFuellgrad: positiveOr(item.sackFuellgrad, DAMM_DEFAULTS.sackFuellgrad),
    sandDichte: positiveOr(item.sandDichte, DAMM_DEFAULTS.sandDichte),
    dammReserve: positiveOr(item.dammReserve, DAMM_DEFAULTS.dammReserve),
    dammPersonal: positiveOr(item.dammPersonal, DAMM_DEFAULTS.dammPersonal),
    dammZielzeit: positiveOr(item.dammZielzeit, DAMM_DEFAULTS.dammZielzeit),
    fuellTrichter: item.fuellTrichter === 'true',
    saeckeRoedeln: item.saeckeRoedeln === 'true',
    transportWeite: positiveOr(
      item.transportWeite,
      DAMM_DEFAULTS.transportWeite
    ),
    lkwNutzlast: positiveOr(item.lkwNutzlast, DAMM_DEFAULTS.lkwNutzlast),
    fuellLeistung: optionalNumber(item.fuellLeistung),
    transportLeistung: optionalNumber(item.transportLeistung),
    verbauLeistung: optionalNumber(item.verbauLeistung),
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
      trichter: params.fuellTrichter,
      roedeln: params.saeckeRoedeln,
      transportWeite: params.transportWeite,
      lkwNutzlast: params.lkwNutzlast,
      freibord: params.freibord,
      fuellLeistung: params.fuellLeistung,
      transportLeistung: params.transportLeistung,
      verbauLeistung: params.verbauLeistung,
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
