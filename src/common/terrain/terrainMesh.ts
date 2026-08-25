import type { LatLngPosition } from '../geo';
import type { BlockStore } from './blockStore';
import { wgs84ToLaea } from './projection';
import {
  buildMosaic,
  chooseContourLevel,
  laeaHull,
  type Mosaic,
} from './terrainMosaic';
import type { TerrainBoundsLatLng, TerrainMesh } from './terrainTypes';

/**
 * Das Geländenetz für die 3D-Ansicht.
 *
 * **Das Gitter ist regelmäßig in Web Mercator, nicht in LAEA.** In LAEA gebaut
 * stünde der Geländefleck durch die Meridiankonvergenz um etwa 5° gedreht im
 * nordorientierten Bild (siehe `projection.ts`), und die Kartenkacheln müssten
 * je Vertex verzerrt werden. Der Preis ist ein einmaliges bilineares Umtasten
 * der Höhen — das gilt der Darstellung; der Vorbehalt gegen Resampling in
 * `docs/hoehenmodell.md` richtet sich gegen Resampling im Datenbestand.
 */

/**
 * Vertexbudget.
 *
 * 256 × 256 = 65.536 Vertices sind rund 800 KB und werden transferiert, nicht
 * kopiert. Ein einzelner Detailblock hätte für sich schon 1 Mio. Zellen.
 */
export const MAX_MESH_VERTICES = 65_536;

const EARTH_RADIUS_M = 6_378_137;
const DEG = Math.PI / 180;

export const mercatorX = (lng: number): number => EARTH_RADIUS_M * lng * DEG;
export const mercatorY = (lat: number): number =>
  EARTH_RADIUS_M * Math.log(Math.tan(Math.PI / 4 + (lat * DEG) / 2));
export const mercatorLng = (x: number): number => x / EARTH_RADIUS_M / DEG;
export const mercatorLat = (y: number): number =>
  (2 * Math.atan(Math.exp(y / EARTH_RADIUS_M)) - Math.PI / 2) / DEG;

/**
 * Der Umrechnungsfaktor von Mercator-Metern auf Geländemeter.
 *
 * Mercator überzeichnet Strecken um `1/cos φ`. Auf 48° Breite sind das 1,49 —
 * ohne diese Umrechnung wäre eine Szeneneinheit 1,49 m statt 1 m, und der
 * angeschriebene Überhöhungsfaktor wäre um denselben Betrag falsch, ohne dass
 * es im Bild zu sehen wäre.
 */
export const groundScale = (latitude: number): number =>
  Math.cos(latitude * DEG);

/**
 * Gitterweite, die ins Budget passt und das Seitenverhältnis hält.
 *
 * Mehr Vertices als Mosaikzellen bringen nichts — sie interpolieren nur
 * zwischen Werten, die es schon gibt.
 */
export function meshGridSize(
  mercWidth: number,
  mercHeight: number,
  maxVertices: number,
  maxCols: number,
  maxRows: number
): { cols: number; rows: number } {
  const aspect = mercWidth > 0 && mercHeight > 0 ? mercWidth / mercHeight : 1;
  let rows = Math.max(2, Math.round(Math.sqrt(maxVertices / aspect)));
  let cols = Math.max(2, Math.round(rows * aspect));
  rows = Math.min(rows, Math.max(2, maxRows));
  cols = Math.min(cols, Math.max(2, maxCols));
  while (cols * rows > maxVertices && (cols > 2 || rows > 2)) {
    if (cols >= rows) cols -= 1;
    else rows -= 1;
  }
  return { cols, rows };
}

/**
 * Bilineare Höhe an einem LAEA-Punkt.
 *
 * Fehlt einer der vier Nachbarn, ist das Ergebnis `NaN`. Aus drei Werten
 * interpoliert wäre es eine erfundene Höhe, und die ist von einer echten nicht
 * zu unterscheiden.
 */
export function sampleMosaic(mosaic: Mosaic, e: number, n: number): number {
  const res = mosaic.level.resolutionM;
  const fcol = e / res - mosaic.colMin;
  const frow = mosaic.rowMax - n / res;
  const c0 = Math.floor(fcol);
  const r0 = Math.floor(frow);
  if (c0 < 0 || r0 < 0 || c0 + 1 >= mosaic.cols || r0 + 1 >= mosaic.rows) {
    return Number.NaN;
  }
  const tc = fcol - c0;
  const tr = frow - r0;
  const v00 = mosaic.values[r0 * mosaic.cols + c0];
  const v01 = mosaic.values[r0 * mosaic.cols + c0 + 1];
  const v10 = mosaic.values[(r0 + 1) * mosaic.cols + c0];
  const v11 = mosaic.values[(r0 + 1) * mosaic.cols + c0 + 1];
  if (
    Number.isNaN(v00) ||
    Number.isNaN(v01) ||
    Number.isNaN(v10) ||
    Number.isNaN(v11)
  ) {
    return Number.NaN;
  }
  return (
    v00 * (1 - tc) * (1 - tr) +
    v01 * tc * (1 - tr) +
    v10 * (1 - tc) * tr +
    v11 * tc * tr
  );
}

/**
 * Dreiecksindizes über das Gitter.
 *
 * Ein Dreieck mit einem Eckpunkt ohne Höhe entfällt ganz. Auf 0 m gesetzt wäre
 * es eine erfundene Fläche — im Wasserstandsmodell später der Unterschied
 * zwischen trocken und überflutet.
 *
 * Umlaufrichtung `a, d, b` bzw. `b, d, e` ergibt mit x nach Osten, y nach oben
 * und z nach Süden eine Normale nach +y, also eine nach oben gerichtete
 * Vorderseite.
 */
export function meshIndices(
  cols: number,
  rows: number,
  holes: Uint8Array
): Uint32Array {
  const out: number[] = [];
  for (let r = 0; r + 1 < rows; r += 1) {
    for (let c = 0; c + 1 < cols; c += 1) {
      const a = r * cols + c;
      const b = a + 1;
      const d = a + cols;
      const e = d + 1;
      if (!holes[a] && !holes[d] && !holes[b]) out.push(a, d, b);
      if (!holes[b] && !holes[d] && !holes[e]) out.push(b, d, e);
    }
  }
  return Uint32Array.from(out);
}

export async function terrainMesh(
  store: BlockStore,
  bounds: TerrainBoundsLatLng,
  maxVertices: number = MAX_MESH_VERTICES
): Promise<TerrainMesh | undefined> {
  const index = await store.index();
  if (!index) return undefined;

  const hull = laeaHull(bounds);
  const level = chooseContourLevel(index, hull);
  if (!level) return undefined;

  const mosaic = await buildMosaic(store, level, hull);
  if (!mosaic) return undefined;

  const xMin = mercatorX(bounds.west);
  const xMax = mercatorX(bounds.east);
  const yMin = mercatorY(bounds.south);
  const yMax = mercatorY(bounds.north);

  const { cols, rows } = meshGridSize(
    xMax - xMin,
    yMax - yMin,
    maxVertices,
    mosaic.cols,
    mosaic.rows
  );

  const cx = (xMin + xMax) / 2;
  const cy = (yMin + yMax) / 2;
  // Die Mitte wird aus dem Mercator-Rechteck zurückgerechnet und nicht als
  // Mittel der Breitengrade genommen: der Szenenursprung liegt auf `cy`, und
  // `sceneProjector` rechnet seinen Maßstab aus `center`. Aus dem Mittel der
  // Breiten wäre das ein anderer Punkt — bei 2 km Ausschnitt gut 10 cm daneben,
  // und die Marken lägen um denselben Betrag neben ihrem Gelände.
  const centerLat = mercatorLat(cy);
  const centerLng = mercatorLng(cx);
  const scale = groundScale(centerLat);

  const positions = new Float32Array(cols * rows * 3);
  const holes = new Uint8Array(cols * rows);
  let minM = Number.POSITIVE_INFINITY;
  let maxM = Number.NEGATIVE_INFINITY;

  for (let r = 0; r < rows; r += 1) {
    // Zeile 0 ist die nördlichste — dieselbe Ordnung wie im Mosaik.
    const my = yMax - ((yMax - yMin) * r) / (rows - 1);
    const lat = mercatorLat(my);
    for (let c = 0; c < cols; c += 1) {
      const mx = xMin + ((xMax - xMin) * c) / (cols - 1);
      const lng = mercatorLng(mx);
      const { e, n } = wgs84ToLaea([lat, lng]);
      const height = sampleMosaic(mosaic, e, n);
      const i = r * cols + c;
      positions[i * 3] = (mx - cx) * scale;
      positions[i * 3 + 2] = (cy - my) * scale;
      if (Number.isNaN(height)) {
        holes[i] = 1;
        positions[i * 3 + 1] = 0;
      } else {
        positions[i * 3 + 1] = height;
        if (height < minM) minM = height;
        if (height > maxM) maxM = height;
      }
    }
  }

  if (!Number.isFinite(minM) || !Number.isFinite(maxM)) return undefined;

  return {
    positions,
    indices: meshIndices(cols, rows, holes),
    holes,
    cols,
    rows,
    widthM: (xMax - xMin) * scale,
    depthM: (yMax - yMin) * scale,
    minM,
    maxM,
    level: level.id,
    resolutionM: level.resolutionM,
    center: [centerLat, centerLng] as LatLngPosition,
    merc: { xMin, xMax, yMin, yMax },
  };
}
