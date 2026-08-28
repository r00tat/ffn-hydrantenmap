/**
 * Eigene Kartenebenen (WMS/WMTS) je Einsatz.
 *
 * Anders als `FirecallLayer` (`type: 'layer'`, Collection `layer`) beschreibt
 * eine Kartenebene **kein** Bündel von Einsatzelementen, sondern einen externen
 * Kartendienst, der über die Basiskarte gelegt wird. Deshalb eine eigene
 * Collection und eine eigene Bezeichnung: „Kartenebene" gegen „Ebene".
 *
 * Dieses Modul hält nur reine Funktionen — es wird sowohl vom Dialog
 * (Validierung) als auch von der Karte (Darstellung) und vom Gelände in 3D
 * benutzt.
 */

/** Subcollection unter `call/{firecallId}`. */
export const FIRECALL_MAP_LAYERS_COLLECTION_ID = 'mapLayer';

export type MapOverlayType = 'WMS' | 'WMTS';

export const MAP_OVERLAY_FORMATS = ['image/png', 'image/jpeg'] as const;

export type MapOverlayFormat = (typeof MAP_OVERLAY_FORMATS)[number];

/**
 * Eine vom Benutzer angelegte Kartenebene.
 *
 * Die Feldnamen weichen bewusst von `TileConfig` ab: hier steht, was der
 * Benutzer eingegeben hat, dort das, was Leaflet braucht.
 * `mapLayerToTileConfig` in `components/Map/tiles.ts` übersetzt zwischen beidem.
 */
export interface FirecallMapLayer {
  id?: string;
  /** Anzeige im Layer-Control. */
  name: string;
  beschreibung?: string;
  overlayType: MapOverlayType;
  /** WMS: GetMap-Endpoint. WMTS: Kachel-Template mit `{z}`, `{x}`, `{y}`. */
  url: string;
  /** WMS `LAYERS`-Parameter, mehrere kommasepariert. */
  wmsLayers?: string;
  format?: string;
  transparent?: boolean;
  /** 0 bis 1. Ohne Angabe undurchsichtig. */
  opacity?: number;
  maxZoom?: number;
  maxNativeZoom?: number;
  /** `süd,west,nord,ost` in Grad. */
  bounds?: string;
  /** Reiner Text — HTML wird beim Speichern und beim Rendern entfernt. */
  attribution?: string;
  /** Beim Öffnen der Karte eingeschaltet. */
  enabled?: boolean;
  /** Stapelung mehrerer eigener Kartenebenen, klein liegt unten. */
  zIndex?: number;
  deleted?: boolean;
  created?: string;
  creator?: string;
  updatedAt?: string;
  updatedBy?: string;
}

/** Präfix im Layer-Control, das eigene von eingebauten Ebenen trennt. */
export const MAP_OVERLAY_NAME_PREFIX = 'Karte: ';

export const DEFAULT_MAP_OVERLAY_MAX_ZOOM = 24;
export const DEFAULT_MAP_OVERLAY_MAX_NATIVE_ZOOM = 19;

/**
 * Nur `https://` und nur ein Dienst ohne eingebettete Zugangsdaten.
 *
 * `http://` scheitert im Browser ohnehin an Mixed Content, und eine URL mit
 * `user:pass@` würde das Passwort in jedem Kachelaufruf und in der
 * Layer-Verwaltung mitschleppen.
 */
export function isSafeMapLayerUrl(url?: string): boolean {
  if (!url) return false;
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  return (
    parsed.protocol === 'https:' &&
    parsed.hostname.length > 0 &&
    parsed.username === '' &&
    parsed.password === ''
  );
}

/** Ein Kachel-Template braucht alle drei Platzhalter, sonst lädt nichts. */
export function hasTileTemplatePlaceholders(url?: string): boolean {
  if (!url) return false;
  return ['{z}', '{x}', '{y}'].every((placeholder) =>
    url.includes(placeholder)
  );
}

/**
 * `süd,west,nord,ost` als Leaflet-Rechteck.
 *
 * Leer und ungültig ergeben beide `undefined`: die Ebene wird dann ohne
 * Begrenzung gezeichnet, was schlimmstenfalls überflüssige Kachelaufrufe kostet.
 * Ob eine Eingabe ungültig ist, beantwortet `isValidBoundsInput`.
 */
export function parseMapLayerBounds(
  value?: string
): [[number, number], [number, number]] | undefined {
  if (!value || !value.trim()) return undefined;
  const parts = value.split(',').map((part) => Number(part.trim()));
  if (parts.length !== 4 || parts.some((n) => !Number.isFinite(n))) {
    return undefined;
  }
  const [south, west, north, east] = parts;
  if (south < -90 || north > 90 || south >= north) return undefined;
  if (west < -180 || east > 180 || west >= east) return undefined;
  return [
    [south, west],
    [north, east],
  ];
}

/** Leere Eingabe gilt als gültig — die Begrenzung ist optional. */
export function isValidBoundsInput(value?: string): boolean {
  if (!value || !value.trim()) return true;
  return parseMapLayerBounds(value) !== undefined;
}

/** 0 bis 1, ohne Angabe undurchsichtig. */
export function clampOpacity(value?: number): number {
  if (value === undefined || value === null || !Number.isFinite(value)) {
    return 1;
  }
  return Math.min(1, Math.max(0, value));
}

/**
 * Die Quellenangabe als reiner Text.
 *
 * Leaflet setzt die Attribution per `innerHTML` in die Karte. Ein vom Benutzer
 * eingegebener Wert darf deshalb kein Markup enthalten — Tags fliegen raus, der
 * Rest wird maskiert. Verlinken lässt sich eine eigene Quelle damit nicht; das
 * ist der Preis dafür, dass niemand über das Feld Skript in die Karte bekommt.
 */
export function sanitizeAttribution(value?: string): string | undefined {
  if (!value) return undefined;
  const text = value
    .replace(/<[^>]*>/g, ' ')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/\s+/g, ' ')
    .trim();
  return text || undefined;
}

/** Name im Layer-Control. Das Präfix macht eigene Ebenen erkennbar. */
export function mapLayerOverlayName(layer: FirecallMapLayer): string {
  return `${MAP_OVERLAY_NAME_PREFIX}${layer.name}`;
}

/**
 * Eindeutige Namen für das Layer-Control.
 *
 * Leaflets `L.Control.Layers` verwaltet seine Einträge über den Namen. Zwei
 * Ebenen mit demselben Namen lassen sich nicht mehr getrennt schalten, und
 * React beschwert sich über doppelte Keys. Doppelte bekommen deshalb eine
 * laufende Nummer.
 */
export function uniqueOverlayNames(layers: FirecallMapLayer[]): string[] {
  const used = new Map<string, number>();
  return layers.map((layer) => {
    const base = mapLayerOverlayName(layer);
    const seen = used.get(base) ?? 0;
    used.set(base, seen + 1);
    return seen === 0 ? base : `${base} (${seen + 1})`;
  });
}

export type MapLayerErrorCode =
  | 'required'
  | 'httpsRequired'
  | 'templateRequired'
  | 'invalidBounds';

export type MapLayerErrors = Partial<
  Record<'name' | 'url' | 'wmsLayers' | 'bounds', MapLayerErrorCode>
>;

/**
 * Prüft eine Eingabe, bevor sie gespeichert wird.
 *
 * Dieselbe Prüfung läuft beim Rendern noch einmal (`isRenderableMapLayer`):
 * Ein Dokument kann auch auf anderem Weg in die Collection gekommen sein —
 * über den Import eines Einsatzes etwa — und die Karte darf sich darauf nicht
 * verlassen, dass der Dialog es geprüft hat.
 */
export function validateMapLayer(
  layer: Partial<FirecallMapLayer>
): MapLayerErrors {
  const errors: MapLayerErrors = {};

  if (!layer.name?.trim()) errors.name = 'required';

  if (!layer.url?.trim()) {
    errors.url = 'required';
  } else if (!isSafeMapLayerUrl(layer.url)) {
    errors.url = 'httpsRequired';
  } else if (
    layer.overlayType !== 'WMS' &&
    !hasTileTemplatePlaceholders(layer.url)
  ) {
    errors.url = 'templateRequired';
  }

  if (layer.overlayType === 'WMS' && !layer.wmsLayers?.trim()) {
    errors.wmsLayers = 'required';
  }

  if (!isValidBoundsInput(layer.bounds)) errors.bounds = 'invalidBounds';

  return errors;
}

/** Eine Kartenebene, die die Karte tatsächlich anfragen darf. */
export function isRenderableMapLayer(layer: FirecallMapLayer): boolean {
  if (layer.deleted) return false;
  return Object.keys(validateMapLayer(layer)).length === 0;
}

/**
 * Reihenfolge der Stapelung: kleiner `zIndex` liegt unten, gleicher `zIndex`
 * nach Namen, damit die Liste bei jedem Benutzer gleich aussieht.
 */
export function sortMapLayers(layers: FirecallMapLayer[]): FirecallMapLayer[] {
  return [...layers].sort((a, b) => {
    const za = a.zIndex ?? 0;
    const zb = b.zIndex ?? 0;
    if (za !== zb) return za - zb;
    return a.name.localeCompare(b.name);
  });
}

/**
 * Das, was in Firestore landet: ohne leere Felder, mit maskierter Attribution
 * und einem `opacity` im erlaubten Bereich.
 */
export function normalizeMapLayer(
  layer: Partial<FirecallMapLayer>
): Omit<FirecallMapLayer, 'id'> {
  const overlayType: MapOverlayType =
    layer.overlayType === 'WMS' ? 'WMS' : 'WMTS';
  const normalized: Omit<FirecallMapLayer, 'id'> = {
    name: (layer.name ?? '').trim(),
    overlayType,
    url: (layer.url ?? '').trim(),
    opacity: clampOpacity(layer.opacity),
    transparent: layer.transparent ?? true,
    enabled: layer.enabled ?? false,
  };

  const beschreibung = layer.beschreibung?.trim();
  if (beschreibung) normalized.beschreibung = beschreibung;

  if (overlayType === 'WMS') {
    const wmsLayers = layer.wmsLayers?.trim();
    if (wmsLayers) normalized.wmsLayers = wmsLayers;
    normalized.format = layer.format?.trim() || 'image/png';
  }

  const bounds = layer.bounds?.trim();
  if (bounds) normalized.bounds = bounds;

  const attribution = sanitizeAttribution(layer.attribution);
  if (attribution) normalized.attribution = attribution;

  if (Number.isFinite(layer.maxZoom)) normalized.maxZoom = layer.maxZoom;
  if (Number.isFinite(layer.maxNativeZoom)) {
    normalized.maxNativeZoom = layer.maxNativeZoom;
  }
  if (Number.isFinite(layer.zIndex)) normalized.zIndex = layer.zIndex;

  return normalized;
}
