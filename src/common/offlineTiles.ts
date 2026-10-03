/**
 * Kartenkacheln für den Offline-Fall: welche Quellen, welches Gebiet, welche
 * Adressen.
 *
 * Bewusst ohne Leaflet und ohne Browser-APIs: Der Service Worker liest daraus
 * Cache-Namen und URL-Prüfung (`src/worker/patterns.ts`), die Seite plant
 * damit den Download (`src/lib/offlineTileDownload.ts`).
 *
 * ## Warum nur basemap.at
 *
 * Massenhaftes Vorladen ist nur dort zulässig, wo der Anbieter es nicht
 * untersagt (siehe docs/kartenlayer.md, Abschnitt „Offline vorladen"):
 *
 * - **OpenStreetMap**: Die Tile Usage Policy der OSMF verbietet das
 *   Vorladen („bulk downloading", „prefetching") ausdrücklich. Ausgeschlossen.
 * - **OpenTopoMap**: ehrenamtlich betriebene Server, dieselbe Linie wie OSM.
 *   Ausgeschlossen.
 * - **WISA-Hochwasserkacheln** und **WMS des Landes Burgenland**: keine
 *   Aussage zum Vorladen; die Burgenland-Dienste rendern jede Kachel neu,
 *   WISA-Adressen hängen an Leaflets BBOX-Formatierung. Ausgeschlossen.
 * - **basemap.at**: offene Verwaltungsdaten unter CC BY 4.0, als statischer
 *   Kachel-Cache für genau diese Nutzung ausgelegt. Aufgenommen — mit Grenze
 *   für Gebiet und Kachelzahl, damit es ein Vorrat für einen Einsatz bleibt.
 */

/** Eigener Cache der vorgeladenen Kacheln. Die Seite schreibt, der Worker liest. */
export const OFFLINE_TILE_CACHE = 'offline-tiles';

export const OFFLINE_TILE_MIN_ZOOM = 13;
export const OFFLINE_TILE_MAX_ZOOM = 18;

/** Obergrenze je Vorbereitung, über alle Ebenen. Rund 100–250 MB. */
export const OFFLINE_TILE_MAX_TILES = 6000;

/** Wählbare Umkreise in Metern. */
export const OFFLINE_TILE_RADII = [500, 1000, 2000, 3000] as const;
export const DEFAULT_OFFLINE_TILE_RADIUS = 1000;

export interface OfflineTileSource {
  /** Schlüssel in `availableLayers`/`overlayLayers` (`tiles.ts`). */
  id: string;
  /** Exakt die URL-Vorlage der Karte — sonst trifft der Cache nie. */
  url: string;
  subdomains: string[];
  /** Gemessene mittlere Kachelgröße bei Neusiedl am See (Zoom 13–18). */
  estimatedBytes: number;
}

export const OFFLINE_TILE_SOURCES: OfflineTileSource[] = [
  {
    id: 'basemap_hdpi',
    url: 'https://maps{s}.wien.gv.at/basemap/bmaphidpi/normal/google3857/{z}/{y}/{x}.jpeg',
    subdomains: ['neu'],
    estimatedBytes: 50_000,
  },
  {
    id: 'basemap_ortofoto',
    url: 'https://maps{s}.wien.gv.at/basemap/bmaporthofoto30cm/normal/google3857/{z}/{y}/{x}.jpeg',
    subdomains: ['neu'],
    estimatedBytes: 20_000,
  },
  {
    id: 'basemap_grey',
    url: 'https://maps{s}.wien.gv.at/basemap/bmapgrau/normal/google3857/{z}/{y}/{x}.png',
    subdomains: ['neu'],
    estimatedBytes: 25_000,
  },
  {
    id: 'adressen',
    url: 'https://maps{s}.wien.gv.at/basemap/bmapoverlay/normal/google3857/{z}/{y}/{x}.png',
    subdomains: ['neu'],
    estimatedBytes: 15_000,
  },
];

export const DEFAULT_OFFLINE_TILE_SOURCES = ['basemap_hdpi', 'adressen'];

/** Gehört die URL zu einer vorladbaren Quelle? (Service-Worker-Regel) */
export function isOfflineTileUrl(url: URL): boolean {
  return (
    url.hostname === 'mapsneu.wien.gv.at' &&
    url.pathname.startsWith('/basemap/')
  );
}

export interface TileCoord {
  z: number;
  x: number;
  y: number;
}

function lngToTileX(lng: number, z: number): number {
  return Math.floor(((lng + 180) / 360) * 2 ** z);
}

function latToTileY(lat: number, z: number): number {
  const rad = (lat * Math.PI) / 180;
  return Math.floor(
    ((1 - Math.asinh(Math.tan(rad)) / Math.PI) / 2) * 2 ** z,
  );
}

const METERS_PER_DEGREE = 111_320;

/** Alle Kacheln (Web-Mercator, XYZ) im Quadrat um den Mittelpunkt. */
export function tilesAround(
  center: { lat: number; lng: number },
  radiusM: number,
  minZoom: number = OFFLINE_TILE_MIN_ZOOM,
  maxZoom: number = OFFLINE_TILE_MAX_ZOOM,
): TileCoord[] {
  const dLat = radiusM / METERS_PER_DEGREE;
  const dLng =
    radiusM / (METERS_PER_DEGREE * Math.cos((center.lat * Math.PI) / 180));
  const north = center.lat + dLat;
  const south = center.lat - dLat;
  const west = center.lng - dLng;
  const east = center.lng + dLng;

  const tiles: TileCoord[] = [];
  for (let z = minZoom; z <= maxZoom; z++) {
    const xMin = lngToTileX(west, z);
    const xMax = lngToTileX(east, z);
    const yMin = latToTileY(north, z);
    const yMax = latToTileY(south, z);
    for (let x = xMin; x <= xMax; x++) {
      for (let y = yMin; y <= yMax; y++) {
        tiles.push({ z, x, y });
      }
    }
  }
  return tiles;
}

/** Die Kachel-URL so, wie Leaflets `TileLayer` sie anfragt. */
export function tileUrl(source: OfflineTileSource, tile: TileCoord): string {
  // Leaflet: `Math.abs(x + y) % subdomains.length`
  const subdomain =
    source.subdomains[Math.abs(tile.x + tile.y) % source.subdomains.length] ??
    '';
  return source.url
    .replace('{s}', subdomain)
    .replace('{z}', String(tile.z))
    .replace('{x}', String(tile.x))
    .replace('{y}', String(tile.y));
}

export interface OfflineTilePlan {
  urls: string[];
  tileCount: number;
  estimatedBytes: number;
  tooLarge: boolean;
}

export function planOfflineTiles(options: {
  center: { lat: number; lng: number };
  radiusM: number;
  sourceIds: string[];
  minZoom?: number;
  maxZoom?: number;
}): OfflineTilePlan {
  const sources = OFFLINE_TILE_SOURCES.filter((s) =>
    options.sourceIds.includes(s.id),
  );
  const tiles = tilesAround(
    options.center,
    options.radiusM,
    options.minZoom,
    options.maxZoom,
  );
  const tileCount = tiles.length * sources.length;
  const estimatedBytes = sources.reduce(
    (sum, s) => sum + s.estimatedBytes * tiles.length,
    0,
  );
  const tooLarge = tileCount > OFFLINE_TILE_MAX_TILES;
  // Bei Überschreitung keine Adressliste bauen: Sie wird nicht gebraucht und
  // wäre bei großem Umkreis unnötig lang.
  const urls = tooLarge
    ? []
    : sources.flatMap((s) => tiles.map((t) => tileUrl(s, t)));
  return { urls, tileCount, estimatedBytes, tooLarge };
}
