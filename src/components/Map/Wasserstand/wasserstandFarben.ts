import { BAND_DEPTHS_M } from '../../../common/terrain/floodBands';

/**
 * Die Tiefenstufen der Wasserfläche.
 *
 * **Feste Rampe, ausdrücklich nicht die ausschnittsbezogene Spanne der
 * Höhenlinien.** 0,3 m und 1 m sind die Schwellen, an denen Befahrbarkeit und
 * Sandsackrechner hängen; eine Farbe, die mit dem Kartenausschnitt wandert,
 * wäre an genau diesen Schwellen unbrauchbar.
 *
 * Von flach nach tief dunkler, halbdurchlässig gezeichnet: unter der Fläche
 * müssen Straßen und Gebäude lesbar bleiben — sie sind der Grund, die Fläche
 * überhaupt anzusehen.
 */

export interface WasserstandBand {
  tiefeM: number;
  farbe: string;
}

export const WASSERSTAND_BANDS: WasserstandBand[] = [
  { tiefeM: 0, farbe: '#bbdefb' },
  { tiefeM: 0.1, farbe: '#64b5f6' },
  { tiefeM: 0.3, farbe: '#1e88e5' },
  { tiefeM: 0.7, farbe: '#1565c0' },
  { tiefeM: 1.5, farbe: '#0d3c78' },
];

/** Schlüssel im Namensraum `wasserstand` je Stufe. */
export const BAND_LABEL_KEYS: Record<number, string> = {
  0: 'band0',
  0.1: 'band01',
  0.3: 'band03',
  0.7: 'band07',
  1.5: 'band15',
};

export const bandColor = (tiefeM: number): string =>
  WASSERSTAND_BANDS.find((band) => band.tiefeM === tiefeM)?.farbe ??
  WASSERSTAND_BANDS[0].farbe;

/** Die Stufe, in die eine Tiefe fällt. `undefined` für trocken. */
export function bandForDepth(depthM: number): WasserstandBand | undefined {
  if (!(depthM >= 0)) return undefined;
  let found: WasserstandBand | undefined;
  for (const band of WASSERSTAND_BANDS) {
    if (depthM >= band.tiefeM) found = band;
  }
  return found;
}

// Die Stufen müssen zu denen gehören, aus denen die Ringe entstehen. Ein
// Auseinanderlaufen wäre eine Legende, die eine andere Fläche beschreibt als
// die gezeichnete.
if (
  WASSERSTAND_BANDS.length !== BAND_DEPTHS_M.length ||
  WASSERSTAND_BANDS.some((band, index) => band.tiefeM !== BAND_DEPTHS_M[index])
) {
  throw new Error(
    'WASSERSTAND_BANDS und BAND_DEPTHS_M müssen dieselben Stufen tragen'
  );
}
