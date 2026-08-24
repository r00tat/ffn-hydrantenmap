import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { unzipSync } from 'fflate';
import { encodeAdriaOffsets } from '../../common/terrain/adriaOffset';
import type { AdriaOffsetGrid } from '../../common/terrain/terrainIndexTypes';
import { proj4, EPSG_DEFINITIONS } from '../../common/wgs-convert';

/**
 * Erzeugt das Versatzgitter, das EVRF2000-Höhen in müA (Adria) überführt.
 *
 * Grundlage ist die **amtliche** Transformation EPSG:9275 („GHA height to
 * EVRF2000 Austria height") in Form des BEV-Höhen-Grids: 396.319 Punkte im
 * 465-m-Raster, als CSV in einem 1,4-MB-Archiv. Das ist keine eigene
 * Regression — eine Vergleichsmessung gegen das Burgenland-DGM ergab am
 * Prüfpunkt +0,391 m gegen amtlich +0,452 m, also 6 cm Abweichung innerhalb
 * ihrer eigenen Streuung von 0,097 m. Die amtliche Größe gewinnt.
 *
 * **Ein Festwert genügt nicht.** Über das Burgenland schwankt der Zuschlag
 * zwischen 0,337 m und 0,476 m, mit einem systematischen Nord-Süd-Trend von
 * 9,8 cm und einem West-Ost-Trend von 6,0 cm. Bei Wassertiefen von 0,3–1 m ist
 * das ein erheblicher Anteil.
 *
 * Neu abgetastet wird auf ein grobes Gitter: das Feld ist mit etwa 1 mm je
 * Kilometer so glatt, dass 5 km Abstand unter einem Millimeter kosten und in
 * wenige hundert Byte passen.
 *
 * Aufruf: npm run terrainCalibrate -- [--cache <dir>] [--step-km <n>]
 */

const HOEHEN_GRID_URL =
  'https://data.bev.gv.at/download/Hoehen_Grid/Hoehen_Grid_CSV.zip';

/** Der Rasterabstand des amtlichen Gitters in Grad. */
const SOURCE_LAT_STEP = 1 / 240; // 0,00416667° ≈ 464 m
const SOURCE_LON_STEP = 1 / 160; // 0,00625° ≈ 466 m

/**
 * Fenster, das das Burgenland mit Rand umschließt. Großzügig gefasst: ein
 * Gitterpunkt zu viel kostet ein Byte.
 */
const BURGENLAND_WINDOW = {
  latMin: 46.7,
  latMax: 48.2,
  lonMin: 15.9,
  lonMax: 17.3,
};

interface Options {
  cacheDir: string;
  stepKm: number;
}

function parseArgs(argv: string[]): Options {
  const options: Options = { cacheDir: '.terrain-cache', stepKm: 5 };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--cache') options.cacheDir = argv[(i += 1)];
    else if (argv[i] === '--step-km') options.stepKm = Number(argv[(i += 1)]);
    else throw new Error(`Unbekannte Option: ${argv[i]}`);
  }
  return options;
}

/** Das Archiv einmal laden und die CSV im Cache ablegen. */
async function loadCsv(cacheDir: string): Promise<string> {
  const file = path.join(cacheDir, 'hoehen-grid.csv');
  try {
    return await readFile(file, 'utf8');
  } catch {
    // Regulär laden.
  }

  console.log(`lade ${HOEHEN_GRID_URL}`);
  const response = await fetch(HOEHEN_GRID_URL);
  if (!response.ok) {
    throw new Error(`${HOEHEN_GRID_URL}: HTTP ${response.status}`);
  }
  const archive = new Uint8Array(await response.arrayBuffer());
  const entries = unzipSync(archive, {
    filter: (entry) => entry.name.toLowerCase().endsWith('.csv'),
  });
  const name = Object.keys(entries)[0];
  if (!name) throw new Error('Keine CSV im Höhen-Grid-Archiv gefunden');
  const csv = Buffer.from(entries[name]).toString('utf8');
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, csv);
  console.log(`${name} entpackt, ${csv.length} Zeichen`);
  return csv;
}

interface SourcePoint {
  lat: number;
  lng: number;
  offsetMm: number;
}

/**
 * Die CSV-Punkte im Burgenland-Fenster, nach WGS84 umgerechnet.
 *
 * Die Koordinaten stehen in EPSG:4312 (MGI geographisch). Der Lageunterschied
 * zu WGS84 beträgt einige hundert Meter; bei einem Feld mit etwa 1 mm je
 * Kilometer sind das weniger als 0,3 mm. Umgerechnet wird trotzdem, weil es
 * nichts kostet und der Vergleich damit sauber bleibt.
 *
 * Vorzeichen: `HOEHENDIFFERENZ` wird laut BEV **von** der orthometrischen Höhe
 * abgezogen, um die Gebrauchshöhe zu erhalten. Also
 * `Adria = EVRF2000 − HOEHENDIFFERENZ`, und der von uns geführte Zuschlag ist
 * das negierte Feld.
 */
function parseCsv(csv: string): SourcePoint[] {
  const points: SourcePoint[] = [];
  const lines = csv.split(/\r?\n/);
  const mgi = EPSG_DEFINITIONS['EPSG:4312'];

  for (let i = 1; i < lines.length; i += 1) {
    const line = lines[i];
    if (!line) continue;
    const [breite, laenge, differenz] = line.split(';');
    const lat = Number(breite);
    const lng = Number(laenge);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    if (
      lat < BURGENLAND_WINDOW.latMin ||
      lat > BURGENLAND_WINDOW.latMax ||
      lng < BURGENLAND_WINDOW.lonMin ||
      lng > BURGENLAND_WINDOW.lonMax
    ) {
      continue;
    }
    const [wgsLng, wgsLat] = proj4(mgi, 'WGS84', [lng, lat]) as unknown as [
      number,
      number,
    ];
    points.push({
      lat: wgsLat,
      lng: wgsLng,
      offsetMm: -Number(differenz) * 1000,
    });
  }
  return points;
}

/** Nächster Quellpunkt zu einer Zielposition. */
const nearest = (
  points: SourcePoint[],
  lat: number,
  lng: number
): SourcePoint => {
  let best = points[0];
  let bestDist = Number.POSITIVE_INFINITY;
  for (const point of points) {
    const dist = (point.lat - lat) ** 2 + (point.lng - lng) ** 2;
    if (dist < bestDist) {
      bestDist = dist;
      best = point;
    }
  }
  return best;
};

function resample(points: SourcePoint[], stepKm: number): AdriaOffsetGrid {
  const latStep = stepKm / 111.32;
  const lonStep = stepKm / (111.32 * Math.cos((47.5 * Math.PI) / 180));

  const latMin = Math.min(...points.map((p) => p.lat));
  const latMax = Math.max(...points.map((p) => p.lat));
  const lonMin = Math.min(...points.map((p) => p.lng));
  const lonMax = Math.max(...points.map((p) => p.lng));

  const cols = Math.ceil((lonMax - lonMin) / lonStep) + 1;
  const rows = Math.ceil((latMax - latMin) / latStep) + 1;

  const offsetsMm: number[] = [];
  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      const lat = latMin + row * latStep;
      const lng = lonMin + col * lonStep;
      offsetsMm.push(nearest(points, lat, lng).offsetMm);
    }
  }

  const metres = offsetsMm.map((mm) => mm / 1000);
  return {
    latMin,
    lonMin,
    latStep,
    lonStep,
    meanM: metres.reduce((a, b) => a + b, 0) / metres.length,
    minM: Math.min(...metres),
    maxM: Math.max(...metres),
    sourcePoints: points.length,
    ...encodeAdriaOffsets(offsetsMm, cols, rows),
  };
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const csv = await loadCsv(options.cacheDir);
  const points = parseCsv(csv);
  console.log(`${points.length} Gitterpunkte im Burgenland-Fenster`);
  if (points.length === 0) {
    throw new Error('Keine Punkte im Fenster — Fensterdefinition prüfen');
  }

  const grid = resample(points, options.stepKm);
  const target = path.join(options.cacheDir, 'terrain-calibration.json');
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, JSON.stringify(grid, null, 2));

  const spanCm = (grid.maxM - grid.minM) * 100;
  console.log(
    `Zuschlag EVRF2000 → müA: Mittel ${grid.meanM.toFixed(3)} m, ` +
      `von ${grid.minM.toFixed(3)} bis ${grid.maxM.toFixed(3)} m ` +
      `(Spanne ${spanCm.toFixed(1)} cm)`
  );
  console.log(
    `Gitter ${grid.cols} × ${grid.rows} bei ${options.stepKm} km, ` +
      `${grid.values.length} Zeichen base64`
  );
  console.log(`geschrieben: ${target}`);

  if (spanCm > 10) {
    console.log(
      'Die Spanne liegt über 10 cm — ein Festwert würde hier nicht genügen.\n' +
        'Genau deshalb trägt der Index ein Gitter und keinen Skalar.'
    );
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
