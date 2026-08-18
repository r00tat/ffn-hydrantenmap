import haversine from 'haversine-distance';
import { GeoPositionObject, LatLngPosition } from './geo';
import {
  GeohashCluster,
  HydrantenRecord,
  Loeschteich,
  Saugstelle,
  WgsObject,
} from './gis-objects';

/**
 * Wasserentnahmestellen, die der Assistent kennt. Die Reihenfolge ist auch die
 * Reihenfolge, in der sie im Prompt und in den Tool-Deklarationen auftauchen.
 */
export const WATER_SUPPLY_KINDS = [
  'hydrant',
  'saugstelle',
  'loeschteich',
] as const;

export type WaterSupplyKind = (typeof WATER_SUPPLY_KINDS)[number];

/** Feld im Cluster-Dokument je Art — siehe `GeohashCluster`. */
const CLUSTER_FIELDS: Record<WaterSupplyKind, string> = {
  hydrant: 'hydranten',
  saugstelle: 'saugstelle',
  loeschteich: 'loeschteich',
};

export const WATER_SUPPLY_LABELS: Record<WaterSupplyKind, string> = {
  hydrant: 'Hydrant',
  saugstelle: 'Saugstelle',
  loeschteich: 'Löschteich',
};

/**
 * Eine Entnahmestelle, aufbereitet für das Modell: flache Schlüssel, deutsche
 * Einheiten, Luftlinien-Distanz in Metern. Bewusst ohne die Rohdaten der
 * GIS-Importe — die tragen Feldnamen wie `geod_tische_saugh_he_m_`, die ein
 * Modell nur raten kann.
 */
export interface WaterSupplyCandidate {
  kind: WaterSupplyKind;
  name: string;
  lat: number;
  lng: number;
  /** Luftlinie zur Zielposition in Metern, gerundet */
  distance: number;
  ortschaft?: string;
  adresse?: string;
  /** Hydrant: Überflurhydrant, Unterflurhydrant, … */
  typ?: string;
  /** Hydrant: Nennweite in mm */
  dimension?: number | string;
  /** Hydrant: statischer Druck in bar */
  statischerDruck?: number;
  /** Hydrant: dynamischer Druck in bar */
  dynamischerDruck?: number;
  /** Hydrant: Leistungsangabe aus dem GIS-Import */
  leistung?: string;
  /** Hydrant: als Füllhydrant gekennzeichnet */
  fuellhydrant?: string;
  /** Saugstelle: Wasserentnahme in l/min */
  wasserentnahme?: number;
  /** Saugstelle: geodätische Saughöhe in m */
  saughoehe?: number;
  /** Löschteich: Fassungsvermögen in m³ */
  fassungsvermoegen?: number;
  /** Löschteich: Zufluss in l/min */
  zufluss?: number;
}

export interface WaterSupplySearchOptions {
  /** Suchradius in Metern */
  radius: number;
  /** Auf diese Arten einschränken; ohne Angabe werden alle gesucht */
  kinds?: WaterSupplyKind[];
  /** Nur Hydranten, deren `typ` diesen Text enthält (z.B. „überflur") */
  hydrantType?: string;
  /** Maximale Anzahl Treffer (nach Distanz sortiert) */
  limit?: number;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function toCandidate(
  kind: WaterSupplyKind,
  record: WgsObject,
  target: GeoPositionObject
): WaterSupplyCandidate | undefined {
  if (!isFiniteNumber(record.lat) || !isFiniteNumber(record.lng)) {
    return undefined;
  }

  const base: WaterSupplyCandidate = {
    kind,
    name: record.name,
    lat: record.lat,
    lng: record.lng,
    distance: Math.round(
      haversine(
        { lat: target.lat, lng: target.lng },
        { lat: record.lat, lng: record.lng }
      )
    ),
  };

  if (record.ortschaft) base.ortschaft = record.ortschaft;
  if (record.adresse) base.adresse = record.adresse;

  switch (kind) {
    case 'hydrant': {
      const h = record as HydrantenRecord;
      if (h.typ) base.typ = h.typ;
      if (h.dimension) base.dimension = h.dimension;
      if (isFiniteNumber(h.statischer_druck)) {
        base.statischerDruck = h.statischer_druck;
      }
      if (isFiniteNumber(h.dynamischer_druck)) {
        base.dynamischerDruck = h.dynamischer_druck;
      }
      if (h.leistung) base.leistung = h.leistung;
      if (h.fuellhydrant) base.fuellhydrant = h.fuellhydrant;
      break;
    }
    case 'saugstelle': {
      const s = record as Saugstelle;
      if (isFiniteNumber(s.wasserentnahme_l_min_)) {
        base.wasserentnahme = s.wasserentnahme_l_min_;
      }
      if (isFiniteNumber(s.geod_tische_saugh_he_m_)) {
        base.saughoehe = s.geod_tische_saugh_he_m_;
      }
      break;
    }
    case 'loeschteich': {
      const l = record as Loeschteich;
      if (isFiniteNumber(l.fassungsverm_gen_m3_)) {
        base.fassungsvermoegen = l.fassungsverm_gen_m3_;
      }
      if (isFiniteNumber(l.zufluss_l_min_)) {
        base.zufluss = l.zufluss_l_min_;
      }
      break;
    }
  }

  return base;
}

/**
 * Wasserentnahmestellen aus bereits geladenen Geohash-Clustern einsammeln,
 * nach Luftlinie zur Zielposition sortiert.
 *
 * Die Geohash-Abfrage liefert ganze Cluster-Kacheln, also auch Datensätze
 * außerhalb des Radius und — bei mehreren überlappenden Kacheln — denselben
 * Datensatz mehrfach. Beides wird hier gefiltert, wie es `Clusters.tsx` für die
 * Kartenlayer ebenfalls tut.
 */
export function collectWaterSupplyCandidates(
  clusters: GeohashCluster[],
  target: GeoPositionObject,
  { radius, kinds, hydrantType, limit }: WaterSupplySearchOptions
): WaterSupplyCandidate[] {
  const wantedKinds = kinds?.length ? kinds : [...WATER_SUPPLY_KINDS];
  const seen = new Set<string>();
  const candidates: WaterSupplyCandidate[] = [];

  for (const kind of wantedKinds) {
    for (const cluster of clusters) {
      const records: WgsObject[] = cluster[CLUSTER_FIELDS[kind]] || [];
      for (const record of records) {
        const candidate = toCandidate(kind, record, target);
        if (!candidate || candidate.distance > radius) continue;
        if (
          kind === 'hydrant' &&
          hydrantType &&
          !(candidate.typ || '')
            .toLocaleLowerCase('de')
            .includes(hydrantType.toLocaleLowerCase('de'))
        ) {
          continue;
        }
        const key = `${kind}:${candidate.name}`;
        if (seen.has(key)) continue;
        seen.add(key);
        candidates.push(candidate);
      }
    }
  }

  candidates.sort((a, b) => a.distance - b.distance);
  return limit && limit > 0 ? candidates.slice(0, limit) : candidates;
}

/** Anzahl Schlauchlängen für eine Leitung, aufgerundet auf ganze Schläuche. */
export function hoseSectionCount(
  distance: number,
  oneHoseLength: number
): number {
  const length = oneHoseLength > 0 ? oneHoseLength : 20;
  return Math.ceil(Math.max(distance, 0) / length);
}

/**
 * Vorschlag für eine Löschleitung, solange er noch nicht bestätigt ist. Die
 * Felder entsprechen den persistierten Feldern der `connection` (inklusive des
 * historisch falsch geschriebenen `oneHozeLength`), damit das Übernehmen ein
 * reines Kopieren bleibt.
 */
export interface HoseLineDraft {
  name: string;
  dimension: string;
  oneHozeLength: number;
  positions: LatLngPosition[];
  /** Länge der Leitung in Metern, gerundet */
  distance: number;
  /** benötigte Schlauchlängen */
  hoseCount: number;
  /** Entnahmestelle, an der die Leitung beginnt */
  source?: { kind: WaterSupplyKind; name: string };
  /** Begründung des Assistenten, warum diese Entnahmestelle */
  reason?: string;
}

export interface BuildHoseLineDraftOptions {
  source: { kind?: WaterSupplyKind; name?: string } & GeoPositionObject;
  target: GeoPositionObject;
  /** Zwischenpunkte, falls die Leitung nicht schnurgerade laufen soll */
  via?: GeoPositionObject[];
  dimension?: string;
  name?: string;
  oneHozeLength?: number;
  reason?: string;
}

export const DEFAULT_HOSE_LENGTH = 20;

export function buildHoseLineDraft({
  source,
  target,
  via,
  dimension,
  name,
  oneHozeLength,
  reason,
}: BuildHoseLineDraftOptions): HoseLineDraft {
  const dim = dimension || 'B';
  const hoseLength =
    oneHozeLength && oneHozeLength > 0 ? oneHozeLength : DEFAULT_HOSE_LENGTH;
  const points = [source, ...(via || []), target];
  const positions: LatLngPosition[] = points.map((p) => [p.lat, p.lng]);

  let distance = 0;
  for (let i = 1; i < points.length; i++) {
    distance += haversine(
      { lat: points[i - 1].lat, lng: points[i - 1].lng },
      { lat: points[i].lat, lng: points[i].lng }
    );
  }
  distance = Math.round(distance);

  return {
    name: name || [`${dim}-Leitung`, source.name].filter(Boolean).join(' '),
    dimension: dim,
    oneHozeLength: hoseLength,
    positions,
    distance,
    hoseCount: hoseSectionCount(distance, hoseLength),
    ...(source.kind && source.name
      ? { source: { kind: source.kind, name: source.name } }
      : {}),
    ...(reason ? { reason } : {}),
  };
}

/** Einzeilige Zusammenfassung für Toast, Sprachausgabe und Modellantwort. */
export function describeHoseLineDraft(draft: HoseLineDraft): string {
  return `${draft.name}: ${draft.distance} m, ${draft.hoseCount} ${draft.dimension}-Längen`;
}
