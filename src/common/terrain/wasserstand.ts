import type { Wasserstand } from '../../components/firebase/firestore';
import type { LatLngPosition } from '../geo';
import { decodePolyline, encodePolyline } from '../polylineCodec';
import type { FloodBand } from './floodBands';
import type { TerrainLevelId } from './terrainIndexTypes';

/**
 * Die Regeln des Wasserstands-Szenarios am Element — ohne React und Leaflet,
 * damit Karte, Panel, Seite und Sandsackrechner **dieselbe** Rechnung sehen.
 *
 * Der Wasserstand ist `Basishöhe am Saatpunkt + Zuschlag`. Damit rechnet das
 * Modell nur mit Differenzen von Höhen desselben Modells, und der Zuschlag
 * EVRF2000 → müA kürzt sich heraus: er ist nur noch Anzeige, nicht mehr
 * tragend. Warum das ein Gewinn ist, steht in `docs/wasserstandsmodell.md`.
 */

/**
 * Version des Modells.
 *
 * Steckt in der Signatur. Ändert sich der Algorithmus, die Tiefenstufen oder
 * die Kodierung, wird sie erhöht — dann gilt jedes gespeicherte Ergebnis als
 * veraltet und wird als solches gekennzeichnet, statt als aktuelles Lagebild
 * durchzugehen.
 */
export const WASSERSTAND_MODEL_VERSION = 1;

export const WASSERSTAND_DEFAULTS = {
  /**
   * 0,5 m Zuschlag.
   *
   * Nicht 0: mit 0 ist der Saatpunkt die einzige geflutete Zelle, und das
   * Ergebnis sähe wie ein Fehler aus. 0,5 m ist der Zuschlag, mit dem die
   * Frage im Einsatz gestellt wird („Pegel plus 50 cm").
   */
  zuschlag: 0.5,
  /**
   * 3 km Umkreis.
   *
   * Nicht unbegrenzt: Ohne Umkreis läuft die Füllung über den Neusiedler See
   * hinweg weiter — der liegt unter jedem Hochwasserstand seiner Zuflüsse — und
   * endet erst am Rechenbudget. Ein Budget in Kacheln ist aber keine Aussage
   * über das Einsatzgebiet, ein Umkreis schon. 500 m deckt die unmittelbare
   * Umgebung des Saatpunkts ab, rechnet schnell und lässt sich am Regler
   * vergrößern — die Vorbelegung ist bewusst klein gewählt, weil ein zu
   * großer Umkreis Kacheln lädt, die niemand angesehen hat.
   */
  radiusM: 500,
  farbe: '#1565c0',
  deckkraft: 45,
};

export const ZUSCHLAG_MIN = 0;
export const ZUSCHLAG_MAX = 3;
export const ZUSCHLAG_STEP = 0.1;

/** Umkreis in m. `RADIUS_MIN` = 0 heißt „unbegrenzt". */
export const RADIUS_MIN = 0;
export const RADIUS_MAX = 20_000;
export const RADIUS_STEP = 250;

/** Ab dieser Fläche läuft die Feinrechnung nicht mehr von selbst. */
export const AUTO_DETAIL_MAX_M2 = 15_000_000;

/** Ab dieser Ausdehnung ist ein konstanter Wasserspiegel eine grobe Annahme. */
export const GRADIENT_WARN_AXIS_M = 5000;

/** Unter so vielen Zellen liegt der Saatpunkt vermutlich nicht im Gewässer. */
export const MIN_PLAUSIBLE_CELLS = 3;

export interface WasserstandParams {
  zuschlag: number;
  /** Umkreis in m; 0 heißt unbegrenzt. */
  radiusM: number;
  basisHoehe?: number;
  basisStufe?: TerrainLevelId;
}

const numberOr = (value: number | undefined, fallback: number): number =>
  typeof value === 'number' && Number.isFinite(value) ? value : fallback;

const stufe = (value: string | undefined): TerrainLevelId | undefined =>
  value === 'detail' || value === 'overview' ? value : undefined;

export function wasserstandParams(item: Wasserstand): WasserstandParams {
  return {
    zuschlag: Math.max(
      ZUSCHLAG_MIN,
      numberOr(item.wasserZuschlag, WASSERSTAND_DEFAULTS.zuschlag)
    ),
    radiusM: Math.min(
      RADIUS_MAX,
      Math.max(
        RADIUS_MIN,
        numberOr(item.wasserRadius, WASSERSTAND_DEFAULTS.radiusM)
      )
    ),
    basisHoehe:
      typeof item.wasserBasisHoehe === 'number' &&
      Number.isFinite(item.wasserBasisHoehe)
        ? item.wasserBasisHoehe
        : undefined,
    basisStufe: stufe(item.wasserBasisStufe),
  };
}

/** Der Wasserstand in EVRF2000, oder `undefined` ohne Basishöhe. */
export function wasserstandLevelM(
  item: Wasserstand,
  zuschlag?: number
): number | undefined {
  const params = wasserstandParams(item);
  if (params.basisHoehe === undefined) return undefined;
  return params.basisHoehe + (zuschlag ?? params.zuschlag);
}

/**
 * Signatur der Eingaben, gegen die ein Ergebnis gilt.
 *
 * Dasselbe Muster wie `routedFor` beim Straßen-Routing: Ein Ergebnis, dessen
 * Signatur nicht mehr passt, wird **gekennzeichnet** und nicht stillschweigend
 * nachgerechnet — ein Lauf lädt Kacheln, und das darf im Hochwasserfall am
 * Netz keine unsichtbare Nebenwirkung sein.
 *
 * Koordinaten auf sechs Stellen: feiner als die Kodierung der Ringe wäre eine
 * Signatur, die auf Gleitkommarauschen umschlägt.
 */
export function wasserstandSignature(
  item: Wasserstand,
  levelId: TerrainLevelId
): string {
  const params = wasserstandParams(item);
  return [
    `v${WASSERSTAND_MODEL_VERSION}`,
    item.lat?.toFixed(6),
    item.lng?.toFixed(6),
    params.basisHoehe?.toFixed(3) ?? '-',
    params.zuschlag.toFixed(3),
    // Der Umkreis gehört in die Signatur: eine andere Reichweite ist eine
    // andere Fläche.
    params.radiusM.toFixed(0),
    levelId,
  ].join('|');
}

/** Ob ein **vorhandenes** Ergebnis nicht mehr zu den Eingaben passt. */
export function wasserstandStale(item: Wasserstand): boolean {
  if (!item.wasserBaender) return false;
  const levelId = stufe(item.wasserStufe);
  if (!levelId) return true;
  return item.wasserGerechnetFuer !== wasserstandSignature(item, levelId);
}

interface StoredBands {
  baender: { tiefeM: number; ringe: string[] }[];
}

export function serialiseWasserBaender(bands: FloodBand[]): string {
  const stored: StoredBands = {
    baender: bands.map((band) => ({
      tiefeM: band.tiefeM,
      ringe: band.ringe.map((ring) => encodePolyline(ring)),
    })),
  };
  return JSON.stringify(stored);
}

/**
 * Die Bänder eines Elements.
 *
 * Unlesbares wird zu einer leeren Liste und nicht zu einem Fehler: ein
 * kaputtes Feld darf die Karte nicht anhalten. Sichtbar ist es trotzdem —
 * ohne Fläche steht im Panel, dass nichts gerechnet ist.
 */
export function parseWasserBaender(item: Wasserstand): FloodBand[] {
  if (!item.wasserBaender) return [];
  try {
    const stored = JSON.parse(item.wasserBaender) as StoredBands;
    if (!Array.isArray(stored?.baender)) return [];
    return stored.baender.map((band) => ({
      tiefeM: band.tiefeM,
      ringe: (band.ringe ?? []).map((encoded) => decodePolyline(encoded)),
    }));
  } catch (err) {
    console.warn('Wasserstands-Bänder unlesbar', err);
    return [];
  }
}

/** Die Ringe der 0-m-Stufe — die Fläche, die „nass" bedeutet. */
export function wasserstandFlaeche(item: Wasserstand): LatLngPosition[][] {
  const band = parseWasserBaender(item).find((entry) => entry.tiefeM === 0);
  return band?.ringe ?? [];
}
