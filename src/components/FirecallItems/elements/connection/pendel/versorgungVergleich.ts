import type { FoerderungView } from '../foerderung/foerderung';
import type { PendelView } from './pendelverkehr';

/**
 * Die Gegenüberstellung: trägt der Pendelverkehr oder die Förderung über lange
 * Wegstrecke die geforderte Menge, und welche ist schneller aufgebaut?
 *
 * Reine Zahlen. Die Aufschriften der Zeilen gehören ins Panel, nicht hierher —
 * damit bleibt diese Datei gegen handgerechnete Beispiele prüfbar, ohne
 * Übersetzungskatalog.
 */

/**
 * Planungswerte für die Aufbauzeit der Förderung. **Keine Tabellenwerte** —
 * anders als die Reibungsverluste stehen sie in keiner Unterlage, siehe
 * docs/pendelverkehr.md. Sie sind im Panel als abgeleitet gekennzeichnet und
 * dort änderbar.
 */
export const VERGLEICH_DEFAULTS = {
  /** Verlegte Meter B-Leitung je Minute, mit Haspel oder vom Fahrzeug. */
  verlegeleistung: 100,
  /** Minuten, bis eine Pumpe in Stellung und angekuppelt ist. */
  pumpenRuestzeit: 3,
};

export interface VergleichAnnahmen {
  verlegeleistung: number;
  pumpenRuestzeit: number;
}

/**
 * Eine Zahl aus dem Feld, oder die Vorbelegung.
 *
 * Nicht `{ ...VERGLEICH_DEFAULTS, ...annahmen }`: Ein Feld, das am Element
 * fehlt, kommt als `undefined` an und würde die Vorbelegung damit
 * **überschreiben** statt sie stehen zu lassen. Das Ergebnis war eine
 * Aufbauzeit von `NaN` und eine Empfehlung, die schwieg.
 */
const numberOr = (value: number | undefined, fallback: number): number =>
  typeof value === 'number' && Number.isFinite(value) ? value : fallback;

export interface VergleichSeite {
  /** Dauerhaft lieferbare Menge in l/min; `undefined`, wenn nicht darstellbar. */
  menge?: number;
  /** Ob diese Variante die geforderte Menge dauerhaft trägt. */
  traegtSollmenge: boolean;
  /** Minuten bis zur vollen Leistung. */
  aufbauzeit?: number;
  /** Gebundene Fahrzeuge — Pumpen bzw. Tanklöschfahrzeuge. */
  fahrzeuge?: number;
}

export interface Vergleich {
  /** Geforderte Menge an der Einsatzstelle in l/min. */
  sollMenge: number;
  pendel: VergleichSeite;
  foerderung: VergleichSeite;
  /**
   * Welche Variante die Lage trägt.
   *
   * `'keine'`, wenn beide die Menge verfehlen — dann ist die Antwort
   * Nachalarmierung und nicht die Wahl zwischen zwei zu kleinen Varianten.
   * `'unklar'`, wenn eine Seite fehlt oder beide gleich schnell aufgebaut sind;
   * eine Empfehlung wäre dort eine Münze, nicht ein Argument.
   */
  empfehlung: 'pendel' | 'foerderung' | 'keine' | 'unklar';
  /** Fahrstrecke in m, ab der der Pendelverkehr die Sollmenge nicht mehr trägt. */
  kipppunkt?: number;
  annahmen: VergleichAnnahmen;
}

const leer: VergleichSeite = { traegtSollmenge: false };

export function versorgungVergleich(
  foerderung: FoerderungView | undefined,
  pendel: PendelView | undefined,
  annahmen: Partial<VergleichAnnahmen> = {}
): Vergleich {
  const werte: VergleichAnnahmen = {
    verlegeleistung: numberOr(
      annahmen.verlegeleistung,
      VERGLEICH_DEFAULTS.verlegeleistung
    ),
    pumpenRuestzeit: numberOr(
      annahmen.pumpenRuestzeit,
      VERGLEICH_DEFAULTS.pumpenRuestzeit
    ),
  };

  const pendelSeite: VergleichSeite = pendel?.result
    ? {
        menge: pendel.result.menge,
        traegtSollmenge: pendel.result.traegtSollmenge,
        // Abgeleitet, ohne neue Annahme: Das erste Fahrzeug gibt sofort ab,
        // eingeschwungen ist der Umlauf nach einer Umlaufzeit.
        aufbauzeit: pendel.result.umlaufzeit,
        fahrzeuge: pendel.params.fahrzeuge,
      }
    : leer;

  const darstellbar = foerderung?.result?.darstellbar === true;
  const foerderungSeite: VergleichSeite = foerderung
    ? {
        // Eine Leitung, die mit diesen Mitteln nicht zu legen ist, liefert
        // nicht die Fördermenge — sie liefert nichts.
        menge: darstellbar ? foerderung.params.foerderMenge : undefined,
        traegtSollmenge: darstellbar,
        aufbauzeit: aufbauzeitFoerderung(foerderung, werte),
        fahrzeuge: foerderung.pumps.length,
      }
    : leer;

  return {
    sollMenge: pendel?.sollMenge ?? foerderung?.params.foerderMenge ?? 0,
    pendel: pendelSeite,
    foerderung: foerderungSeite,
    empfehlung: empfehlung(foerderung, pendel, pendelSeite, foerderungSeite),
    kipppunkt: pendel?.result?.kipppunkt,
    annahmen: werte,
  };
}

/**
 * Verlegen plus Pumpen in Stellung bringen.
 *
 * Parallele Leitungen zählen als die doppelte Strecke: Zwei B-Leitungen sind
 * zweimal die Arbeit. Dass zwei Trupps sie gleichzeitig legen könnten, ist eine
 * Annahme über die Mannschaftsstärke, die dieser Rechner nicht kennt — und die
 * längere Zeit ist die, mit der man planen sollte.
 *
 * Die Pumpe an der Entnahmestelle zählt mit: Auch sie muss in Stellung, anders
 * als bei der Zählung der Verstärkerpumpen.
 */
function aufbauzeitFoerderung(
  view: FoerderungView,
  annahmen: VergleichAnnahmen
): number | undefined {
  if (!(annahmen.verlegeleistung > 0)) return undefined;
  const meter = view.length * Math.max(1, view.params.paralleleLeitungen);
  return (
    meter / annahmen.verlegeleistung +
    view.pumps.length * annahmen.pumpenRuestzeit
  );
}

function empfehlung(
  foerderung: FoerderungView | undefined,
  pendel: PendelView | undefined,
  pendelSeite: VergleichSeite,
  foerderungSeite: VergleichSeite
): Vergleich['empfehlung'] {
  // Ohne beide Seiten gibt es nichts zu vergleichen. Eine Empfehlung, die nur
  // eine Variante gesehen hat, ist keine.
  if (!foerderung || !pendel) return 'unklar';

  if (pendelSeite.traegtSollmenge && !foerderungSeite.traegtSollmenge) {
    return 'pendel';
  }
  if (foerderungSeite.traegtSollmenge && !pendelSeite.traegtSollmenge) {
    return 'foerderung';
  }
  if (!pendelSeite.traegtSollmenge && !foerderungSeite.traegtSollmenge) {
    return 'keine';
  }

  // Beide tragen — dann gewinnt der kürzere Aufbau.
  const a = pendelSeite.aufbauzeit;
  const b = foerderungSeite.aufbauzeit;
  if (a === undefined || b === undefined || a === b) return 'unklar';
  return a < b ? 'pendel' : 'foerderung';
}
