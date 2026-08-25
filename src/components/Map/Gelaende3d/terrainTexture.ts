import L from 'leaflet';
import type { TerrainBoundsLatLng } from '../../../common/terrain/terrainTypes';
import { availableLayers, type TileConfig } from '../tiles';
import { MAX_TEXTURE_PX } from './gelaende3d';

/**
 * Das Kartenbild des Ausschnitts als Textur für das Geländenetz.
 *
 * Die URLs werden aus der **Konfiguration** in `tiles.ts` gebaut und nicht über
 * `L.TileLayer.getTileUrl` geholt: Leaflet setzt dort die Zoomstufe der Karte
 * ein (`_getZoomForUrl`), nicht die hier gewählte. Bei jeder Stufe unterhalb
 * der Kartenzoomstufe — dem Normalfall — käme die falsche Kachel.
 */

export const TILE_PX = 256;

/** Halbe Kantenlänge der Mercator-Welt. */
const WORLD_M = 20_037_508.342789244;

export interface TileGrid {
  z: number;
  xMin: number;
  yMin: number;
  xMax: number;
  yMax: number;
  widthPx: number;
  heightPx: number;
  /** Mercator-Rechteck, das das Bild abdeckt — Grundlage der UV-Koordinaten. */
  merc: { xMin: number; xMax: number; yMin: number; yMax: number };
}

const tileX = (lng: number, z: number): number =>
  Math.floor(((lng + 180) / 360) * 2 ** z);

const tileY = (lat: number, z: number): number => {
  const rad = (lat * Math.PI) / 180;
  return Math.floor(
    ((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * 2 ** z
  );
};

/**
 * Die feinste Zoomstufe, deren Kacheln noch in die Textur passen.
 *
 * Gesucht wird von der Kartenzoomstufe abwärts; bei z = 0 ist es eine Kachel,
 * die Schleife endet also immer.
 */
export function tileGrid(
  bounds: TerrainBoundsLatLng,
  startZoom: number,
  config?: TileConfig,
  maxPx: number = MAX_TEXTURE_PX
): TileGrid {
  const maxTiles = Math.max(1, Math.floor(maxPx / TILE_PX));
  const native = config?.options?.maxNativeZoom;
  const start = Math.min(
    typeof native === 'number' ? native : 22,
    Math.max(0, Math.floor(startZoom))
  );
  for (let z = start; ; z -= 1) {
    const xMin = tileX(bounds.west, z);
    const xMax = tileX(bounds.east, z);
    const yMin = tileY(bounds.north, z);
    const yMax = tileY(bounds.south, z);
    const fits = xMax - xMin + 1 <= maxTiles && yMax - yMin + 1 <= maxTiles;
    if (fits || z === 0) {
      const span = (2 * WORLD_M) / 2 ** z;
      return {
        z,
        xMin,
        xMax,
        yMin,
        yMax,
        widthPx: (xMax - xMin + 1) * TILE_PX,
        heightPx: (yMax - yMin + 1) * TILE_PX,
        merc: {
          xMin: -WORLD_M + xMin * span,
          xMax: -WORLD_M + (xMax + 1) * span,
          yMin: WORLD_M - (yMax + 1) * span,
          yMax: WORLD_M - yMin * span,
        },
      };
    }
  }
}

/** Der Konfigurationseintrag zu einem angezeigten Layernamen. */
export function findLayerConfig(name?: string): TileConfig | undefined {
  const entries = Object.values(availableLayers);
  return entries.find((layer) => layer.name === name) ?? entries[0];
}

/** Kachel-URL nach dem Muster aus `tiles.ts`. Leaflets Subdomain-Wahl. */
export function tileUrl(
  config: TileConfig,
  x: number,
  y: number,
  z: number
): string {
  const subdomains = (config.options?.subdomains as string[]) ?? [''];
  const s = subdomains[Math.abs(x + y) % subdomains.length];
  return L.Util.template(config.url, { s, x, y, z, r: '' });
}

/**
 * Ein einzelnes GetMap über den ganzen Ausschnitt für WMS-Layer.
 *
 * Der WMS kennt kein Kachelschema; ein Bild über das Mercator-Rechteck ist
 * zugleich weniger Verkehr als 64 Einzelanfragen.
 */
export function wmsUrl(config: TileConfig, grid: TileGrid): string {
  const params = new URLSearchParams({
    SERVICE: 'WMS',
    VERSION: '1.3.0',
    REQUEST: 'GetMap',
    CRS: 'EPSG:3857',
    LAYERS: String(config.options?.layers ?? ''),
    STYLES: '',
    FORMAT: String(config.options?.format ?? 'image/jpeg'),
    TRANSPARENT: config.options?.transparent ? 'TRUE' : 'FALSE',
    WIDTH: String(grid.widthPx),
    HEIGHT: String(grid.heightPx),
    BBOX: `${grid.merc.xMin},${grid.merc.yMin},${grid.merc.xMax},${grid.merc.yMax}`,
  });
  return `${config.url}${config.url.includes('?') ? '' : '?'}${params}`;
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    // Ohne `crossOrigin` färbt das Bild das Canvas ein („tainted"), und der
    // Texturupload nach WebGL wirft — das Gelände bliebe grau, ohne dass ein
    // Fehler zu sehen wäre. basemap.at, OpenStreetMap und der Burgenland-WMS
    // senden Access-Control-Allow-Origin.
    image.crossOrigin = 'anonymous';
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`Kachel nicht geladen: ${url}`));
    image.src = url;
  });
}

/**
 * Das Kachelmosaik in ein Canvas zeichnen.
 *
 * Eine fehlende Kachel bleibt neutral grau stehen. Schwarz wäre von einem Loch
 * im Gelände nicht zu unterscheiden.
 */
export async function composeTexture(
  config: TileConfig,
  grid: TileGrid
): Promise<HTMLCanvasElement> {
  const canvas = document.createElement('canvas');
  canvas.width = grid.widthPx;
  canvas.height = grid.heightPx;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D-Kontext für die Textur nicht verfügbar');
  ctx.fillStyle = '#9e9e9e';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  if (config.type === 'WMS') {
    await loadImage(wmsUrl(config, grid))
      .then((image) => ctx.drawImage(image, 0, 0, canvas.width, canvas.height))
      .catch(() => undefined);
    return canvas;
  }

  const jobs: Promise<void>[] = [];
  for (let x = grid.xMin; x <= grid.xMax; x += 1) {
    for (let y = grid.yMin; y <= grid.yMax; y += 1) {
      const dx = (x - grid.xMin) * TILE_PX;
      const dy = (y - grid.yMin) * TILE_PX;
      jobs.push(
        loadImage(tileUrl(config, x, y, grid.z))
          .then((image) => {
            ctx.drawImage(image, dx, dy, TILE_PX, TILE_PX);
          })
          .catch(() => undefined)
      );
    }
  }
  await Promise.all(jobs);
  return canvas;
}
