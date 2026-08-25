import L from 'leaflet';
import type { TerrainBoundsLatLng } from '../../../common/terrain/terrainTypes';
import { availableLayers, overlayLayers, type TileConfig } from '../tiles';
import { MAX_TEXTURE_PX } from './gelaende3d';
import { isOverlayVisible, type OverlayStates } from './visibleItems';

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

/**
 * Die eingeblendeten Überlagerungen, in der Reihenfolge ihrer Stapelung.
 *
 * Hochwasser-Gefahrenkarten, Risikogebiete, Adressen: was in der Karte über dem
 * Kartenbild liegt, gehört auch in die Textur — sonst zeigt die 3D-Ansicht eine
 * andere Lage als die Karte daneben.
 *
 * Nur die Kachel- und WMS-Ebenen. Die übrigen Überlagerungen (Hydranten,
 * Pegelstände, Live-Standorte) sind Marken und kein Kartenbild; sie ließen sich
 * nicht in eine Textur zeichnen.
 */
export function activeOverlays(overlays: OverlayStates): TileConfig[] {
  return Object.values(overlayLayers).filter((layer) =>
    isOverlayVisible(layer.name, overlays, layer.enabled === true)
  );
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
 * Kantenlänge einer WMS-Anfrage.
 *
 * `tileSize: 512` ist das, was die Karte in `Map.tsx` an `WMSTileLayer`
 * übergibt — und der WISA-Dienst (`tiles.lfrz.gv.at`) kennt nichts anderes.
 */
export const WMS_TILE_PX = 512;

/** Ein Mercator-Rechteck. */
export interface MercBox {
  xMin: number;
  yMin: number;
  xMax: number;
  yMax: number;
}

/**
 * Ein GetMap über **eine Kachel** des Rasters.
 *
 * **Version 1.1.1 mit `SRS`, nicht 1.3.0 mit `CRS`** — dieselbe Anfrage, die
 * Leaflets `WMSTileLayer` von sich aus stellt. Der WISA-Dienst beantwortet
 * 1.3.0 mit `400`.
 */
export function wmsUrl(
  config: TileConfig,
  box: MercBox,
  sizePx: number = WMS_TILE_PX
): string {
  const params = new URLSearchParams({
    SERVICE: 'WMS',
    VERSION: '1.1.1',
    REQUEST: 'GetMap',
    SRS: 'EPSG:3857',
    LAYERS: String(config.options?.layers ?? ''),
    STYLES: '',
    FORMAT: String(config.options?.format ?? 'image/jpeg'),
    TRANSPARENT: config.options?.transparent ? 'TRUE' : 'FALSE',
    WIDTH: String(sizePx),
    HEIGHT: String(sizePx),
    BBOX: `${box.xMin},${box.yMin},${box.xMax},${box.yMax}`,
  });
  return `${config.url}${config.url.includes('?') ? '' : '?'}${params}`;
}

export interface WmsBlock {
  /** Ziel im Canvas, in Texturpixeln. Darf negativ sein — das Canvas schneidet ab. */
  dx: number;
  dy: number;
  sizePx: number;
  box: MercBox;
}

/**
 * Die Kacheln, aus denen eine WMS-Ebene zusammengesetzt wird.
 *
 * **Der Zuschnitt ist nicht frei wählbar.** Der WISA-Dienst ist ein
 * Kachel-Cache: er beantwortet ausschließlich Anfragen, die genau auf seinem
 * Raster liegen — jedes andere Rechteck bekommt `400 Bad Request`, gemessen an
 * derselben Stelle und derselben Auflösung. Ein einzelnes GetMap über den
 * Ausschnitt kann deshalb nie funktionieren, so naheliegend es wäre.
 *
 * Das Raster ist das von Leaflet: ein Feld mit `tileSize: 512` deckt genau
 * 2 × 2 Kacheln des 256er-Rasters ab und kommt in doppelter Auflösung zurück.
 * Sein Rechteck ist damit **eine Kachel des 256er-Rasters eine Stufe gröber** —
 * und weil 512 Texturpixel darauf entfallen, wird es unverändert eingezeichnet.
 *
 * Dass die Ziel-Ecke negativ sein kann, ist Absicht: beginnt die Textur auf
 * einer ungeraden Kachel, ragt das erste Feld nach links oben hinaus.
 */
export function wmsBlocks(grid: TileGrid): WmsBlock[] {
  if (grid.z < 1) return [];
  const z = grid.z - 1;
  const span = (2 * WORLD_M) / 2 ** z;

  const blocks: WmsBlock[] = [];
  for (let row = Math.floor(grid.yMin / 2); row <= Math.floor(grid.yMax / 2); row += 1) {
    for (let col = Math.floor(grid.xMin / 2); col <= Math.floor(grid.xMax / 2); col += 1) {
      const xMin = -WORLD_M + col * span;
      const yMax = WORLD_M - row * span;
      blocks.push({
        dx: (col * 2 - grid.xMin) * TILE_PX,
        dy: (row * 2 - grid.yMin) * TILE_PX,
        sizePx: WMS_TILE_PX,
        box: { xMin, xMax: xMin + span, yMin: yMax - span, yMax },
      });
    }
  }
  return blocks;
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    // Ohne `crossOrigin` färbt das Bild das Canvas ein („tainted"), und der
    // Texturupload nach WebGL wirft — das Gelände bliebe grau, ohne dass ein
    // Fehler zu sehen wäre. basemap.at, OpenStreetMap, der Burgenland-WMS und
    // der WISA-Dienst senden Access-Control-Allow-Origin.
    image.crossOrigin = 'anonymous';
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`Kachel nicht geladen: ${url}`));
    image.src = url;
  });
}

/**
 * Eine Ebene in das Canvas zeichnen.
 *
 * Ein WMS liefert ein Bild über das ganze Rechteck, eine Kachelebene ein Raster.
 * Eine Kachel, die nicht kommt, wird übergangen — der Untergrund bleibt stehen.
 */
async function drawLayer(
  ctx: CanvasRenderingContext2D,
  config: TileConfig,
  grid: TileGrid
): Promise<void> {
  if (config.type === 'WMS') {
    await Promise.all(
      wmsBlocks(grid).map((block) =>
        loadImage(wmsUrl(config, block.box))
          .then((image) => {
            ctx.drawImage(
              image,
              block.dx,
              block.dy,
              block.sizePx,
              block.sizePx
            );
          })
          .catch(() => undefined)
      )
    );
    return;
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
}

/**
 * Kartenbild und Überlagerungen in ein Canvas zeichnen.
 *
 * Eine fehlende Kachel bleibt neutral grau stehen. Schwarz wäre von einem Loch
 * im Gelände nicht zu unterscheiden.
 */
export async function composeTexture(
  config: TileConfig,
  grid: TileGrid,
  overlays: TileConfig[] = []
): Promise<HTMLCanvasElement> {
  const canvas = document.createElement('canvas');
  canvas.width = grid.widthPx;
  canvas.height = grid.heightPx;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D-Kontext für die Textur nicht verfügbar');
  ctx.fillStyle = '#9e9e9e';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  await drawLayer(ctx, config, grid);
  // Nacheinander und nicht nebenläufig: die Reihenfolge **ist** die Stapelung.
  // Parallel gezeichnet läge die Gefahrenkarte mal über und mal unter den
  // Adressen, je nachdem, welche Kachel zuerst da war.
  for (const overlay of overlays) {
    await drawLayer(ctx, overlay, grid);
  }
  return canvas;
}
