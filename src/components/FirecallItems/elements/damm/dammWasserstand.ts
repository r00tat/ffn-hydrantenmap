import type { LatLngPosition } from '../../../../common/geo';
import { pointInRings } from '../../../../common/terrain/floodBands';
import {
  wasserstandFlaeche,
  wasserstandLevelM,
} from '../../../../common/terrain/wasserstand';
import type { Line, Wasserstand } from '../../../firebase/firestore';

/**
 * Die Dammhöhe aus einem Wasserstands-Szenario.
 *
 * Maßgeblich ist die **größte** Wassertiefe entlang der Linie: der tiefste
 * Punkt der Trasse entscheidet, wie hoch der Damm werden muss. Ein Mittelwert
 * wäre an genau der Stelle zu niedrig, an der der Damm überströmt.
 *
 * Ob ein Punkt nass ist, entscheidet die **gespeicherte Fläche**, nicht ein
 * Höhenvergleich: die hydraulische Verbindung steckt schon im Ergebnis. Ein
 * Punkt hinter einer Anhöhe zählt trocken, auch wenn er tiefer als der
 * Wasserstand liegt. Geprüft wird mit derselben **Even-odd**-Regel, mit der die
 * Karte die Fläche füllt — sonst gehörte die Zahl im Rechner zu einer anderen
 * Fläche als die, die man sieht.
 *
 * Die Höhenabfrage ist Sache des Aufrufers und wird als `samples`
 * hereingegeben. Damit ist diese Rechnung ohne Netz und ohne Worker prüfbar.
 */

/** Schrittweite des Reglers im Sandsackrechner. */
const HOEHE_STEP = 0.1;

export interface DammWasserstandSample {
  position: LatLngPosition;
  heightM: number;
}

export interface DammWasserstandInput {
  item: Line;
  szenario: Wasserstand;
  samples: DammWasserstandSample[];
  freibord: number;
  /** Obergrenze des Reglers. Darüber wird gewarnt, nicht gekappt. */
  maxHoehe?: number;
}

export interface DammWasserstandResult {
  /** Größte Wassertiefe entlang der Linie in m. */
  maxTiefeM: number;
  /** Vorschlag für `dammHoehe`, oder `undefined` wenn nichts zu rechnen ist. */
  dammHoehe?: number;
  /** Die Linie liegt vollständig außerhalb der Fläche. */
  trocken: boolean;
  /** Das Szenario hat keine Basishöhe — es ist nichts gerechnet. */
  keinWasserstand: boolean;
  /** Tiefe plus Freibord übersteigt die Reichweite des Verbaus. */
  ueberMax: boolean;
  /** Wasserstand in EVRF2000, für die Anzeige der Herkunft. */
  wasserstandM?: number;
}

export function dammHoeheAusWasserstand({
  szenario,
  samples,
  freibord,
  maxHoehe,
}: DammWasserstandInput): DammWasserstandResult {
  const levelM = wasserstandLevelM(szenario);
  if (levelM === undefined) {
    return {
      maxTiefeM: 0,
      trocken: false,
      keinWasserstand: true,
      ueberMax: false,
    };
  }

  const rings = wasserstandFlaeche(szenario);
  let maxTiefe = 0;
  let nass = false;
  for (const sample of samples) {
    if (!pointInRings(sample.position, rings)) continue;
    nass = true;
    const tiefe = levelM - sample.heightM;
    if (tiefe > maxTiefe) maxTiefe = tiefe;
  }

  if (!nass) {
    return {
      maxTiefeM: 0,
      trocken: true,
      keinWasserstand: false,
      ueberMax: false,
      wasserstandM: levelM,
    };
  }

  const roh = maxTiefe + freibord;
  const dammHoehe = Math.round(roh / HOEHE_STEP) * HOEHE_STEP;
  return {
    maxTiefeM: maxTiefe,
    dammHoehe: Number(dammHoehe.toFixed(2)),
    trocken: false,
    keinWasserstand: false,
    ueberMax: maxHoehe !== undefined && dammHoehe > maxHoehe,
    wasserstandM: levelM,
  };
}

/**
 * Die Szenarien eines Einsatzes, die die Linie berührenden zuerst.
 *
 * Bei mehreren Szenarien soll die Auswahl nicht in alphabetischer Ordnung
 * anfangen, sondern mit dem, das an dieser Linie überhaupt eine Aussage macht.
 */
export function wasserstandeFuerLinie(
  szenarien: Wasserstand[],
  positions: LatLngPosition[]
): Wasserstand[] {
  const touches = (item: Wasserstand): boolean => {
    const rings = wasserstandFlaeche(item);
    return positions.some((position) => pointInRings(position, rings));
  };
  const nah = szenarien.filter(touches);
  const fern = szenarien.filter((item) => !nah.includes(item));
  return [...nah, ...fern];
}
