import type {
  DrawingStroke,
  Firecall,
  FirecallItem,
  FirecallLayer,
} from '../../components/firebase/firestore';
import type { FirecallMapLayer } from '../mapLayers';
import type { GeoJsonFeatureColleaction } from '../../server/geojson';

/**
 * Rohzugriff auf die typspezifischen Felder eines Items.
 *
 * `FirecallItem` deklariert nur die gemeinsamen Felder; `dimension`,
 * `dammHoehe`, `zeichen` und Verwandte hängen an den Untertypen. Die Konverter
 * arbeiten bewusst auf dem Rohdokument statt über `getItemInstance()`, damit die
 * Tests ohne jsdom und ohne Leaflet-Mocks laufen.
 */
export function itemFields(item: FirecallItem): Record<string, unknown> {
  return item as unknown as Record<string, unknown>;
}

/** Ein Item-Fragment, wie es die Symbolrückführung liefert. */
export type ItemPatch = { type: string } & Record<string, unknown>;

/** Basis-URL der Symbole von lagekarte.info. */
export const LAGEKARTE_ICON_BASE = 'https://www.lagekarte.info/src/img';

/**
 * Die drei Untergruppen, die beide Referenz-Exporte enthalten. Eine vierte,
 * eigens benannte Gruppe wird bewusst nicht geschrieben — es ist nicht
 * prüfbar, ob lagekarte.info sie liest (closed source, kein Sample).
 */
export const LAGEKARTE_GROUP_NAMES = [
  'zeichnungen',
  'fahrzeuge',
  'taktischezeichen',
] as const;
export type LagekarteGroupName = (typeof LAGEKARTE_GROUP_NAMES)[number];

/** Leaflet-Path-/Icon-Options, wörtlich wie lagekarte.info sie schreibt. */
export interface LagekarteOptions {
  color?: string;
  fillColor?: string;
  weight?: number;
  dashArray?: number[];
  /** `'border'` = nur Rand, keine Füllung */
  filltype?: string;
  /** Kreisradius in Metern — als String, so wie im Sample */
  radius?: string;
  distanceMarkers?: boolean;
  /** Abstand der Kupplungsmarker in Metern */
  offset?: number;
  /** `'B-Line'` | `'C-Line'` */
  lineType?: string;
  /** Gruppenzugehörigkeit, mehrfach möglich */
  g?: string[];
  iconMarker?: boolean;
  icon?: { options?: { iconUrl?: string; type?: string } };
}

export interface LagekarteInfoData {
  bezeichnung?: string;
  label?: string;
  informationen?: string;
  mannschaftAnz?: string;
  mannschaft?: unknown[];
}

/** Unser Zusatzblock für den verlustfreien Rückweg. lagekarte ignoriert ihn. */
export interface LagekarteFfndBlock {
  v: 1;
  item: FirecallItem;
  strokes?: DrawingStroke[];
}

/**
 * Eine WMS-Ebene, wie lagekarte.info sie schreibt.
 *
 * Belegt in `captures/lagekarte (3).json`. **`bounds` steht hier als
 * `west,süd,ost,nord`** — Länge zuerst, anders als in unserem
 * `FirecallMapLayer.bounds`. Die Umrechnung steht in `wmsLayers.ts`.
 */
export interface LagekarteWmsLayer {
  url: string;
  /** Wert des `LAYERS`-Parameters. */
  layer: string;
  /** Anzeigename. */
  name: string;
  /** `west,süd,ost,nord` in Grad. */
  bounds?: string;
  /** Umgekehrt zu unserem `enabled`. */
  disabled: boolean;
}

/**
 * Unser Zusatzblock auf Dateiebene. lagekarte ignoriert ihn.
 *
 * Trägt, was `wmslayers` nicht kennt: Deckkraft, Format, Transparenz,
 * Zoomgrenzen, Stapelung — und Kachel-Ebenen, für die es dort gar kein Feld
 * gibt.
 */
export interface LagekarteFfndFileBlock {
  v: 1;
  mapLayers?: FirecallMapLayer[];
}

export type LagekarteFeatureType =
  | 'polyline'
  | 'polygon'
  | 'rectangle'
  | 'circle'
  | 'marker';

export interface LagekarteFeature {
  type: 'Feature';
  properties: {
    type?: LagekarteFeatureType;
    options?: LagekarteOptions;
    infoData?: LagekarteInfoData;
    ffnd?: LagekarteFfndBlock;
  };
  geometry: {
    type: 'Point' | 'LineString' | 'Polygon';
    coordinates: number[] | number[][] | number[][][];
  } | null;
}

/**
 * Die namenlose Punkt-Sammlung, die vor jeder Schlauchleitung steht. Abgeleitete
 * Geometrie — beim Import überspringen, beim Export erzeugen.
 */
export interface LagekarteCouplingCollection {
  type: 'FeatureCollection';
  features: LagekarteFeature[];
  properties: { options: Record<string, never> };
}

export interface LagekarteGroup {
  type: 'FeatureCollection';
  name: string;
  features: (LagekarteFeature | LagekarteCouplingCollection)[];
}

export interface LagekarteMessage {
  id: number;
  /** ISO 8601 */
  date: string;
  text: string;
  textorg: string;
  coords: number[];
}

export interface LagekarteGroupEntry {
  /** `'eg_0'`, `'eg_1'`, … */
  name: string;
  /** angezeigter Name */
  g_name: string;
  disabled: boolean;
}

export interface LagekarteHistoryEntry {
  name: string;
  /** Unix-Sekunden */
  timestamp: number;
  sp: {
    data: {
      type: 'FeatureCollection';
      name: string;
      features: LagekarteGroup[];
      groups: LagekarteGroupEntry[];
      notes: string;
    };
    timestamp: number;
  };
}

export interface LagekarteFile {
  type: 'FeatureCollection';
  name: string;
  /** `[lat, lng]` — als Strings, so wie im Sample */
  view: [string, string];
  zoom: number;
  groups: LagekarteGroupEntry[];
  notes: string;
  messages: LagekarteMessage[];
  history: LagekarteHistoryEntry[];
  /** Schema unbekannt — immer `[]` schreiben */
  colors: unknown[];
  /** Eigene WMS-Kartenebenen. */
  wmslayers: LagekarteWmsLayer[];
  features: LagekarteGroup[];
  /** Unser Zusatzblock. Fehlt in Dateien, die von lagekarte.info stammen. */
  ffnd?: LagekarteFfndFileBlock;
}

/** Eingabe für den Export. */
export interface LagekarteSource {
  firecall: Firecall;
  items: FirecallItem[];
  layers: FirecallLayer[];
  /** Eigene Kartenebenen (WMS/WMTS) des Einsatzes. */
  mapLayers?: FirecallMapLayer[];
  /** Strokes je `drawing`-Item, Schlüssel = Item-Id */
  strokes: Record<string, DrawingStroke[]>;
  /** Statische GIS-Daten; fehlt, wenn die Server Action ausfiel */
  gis?: GeoJsonFeatureColleaction;
}

/** Ergebnis des Imports. */
export interface LagekarteParseResult {
  /**
   * Anzulegende Ebenen, ohne `id` — der Index korrespondiert zu
   * `items[].layerIndex`. Die letzte Ebene ist immer die Sammelebene.
   */
  layers: FirecallItem[];
  /** Items mit dem Index ihrer Ebene in `layers` */
  items: { item: FirecallItem; layerIndex: number }[];
  /** Tagebuch-Einträge aus `messages` — gehören in die Sammelebene */
  diaries: FirecallItem[];
  /** Eigene Kartenebenen, ohne `id` — der Schreibpfad legt sie neu an. */
  mapLayers: FirecallMapLayer[];
  warnings: string[];
}
