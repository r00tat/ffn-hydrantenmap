import { describe, expect, it } from 'vitest';
import {
  BAND_LABEL_KEYS,
  bandColor,
  bandForDepth,
  WASSERSTAND_BANDS,
} from './wasserstandFarben';

describe('wasserstandFarben', () => {
  it('hat für jede Tiefenstufe eine Farbe und eine Aufschrift', () => {
    for (const band of WASSERSTAND_BANDS) {
      expect(bandColor(band.tiefeM)).toMatch(/^#[0-9a-f]{6}$/i);
      expect(BAND_LABEL_KEYS[band.tiefeM]).toBeTruthy();
    }
  });

  it('ordnet eine Tiefe der richtigen Stufe zu', () => {
    expect(bandForDepth(0.05)?.tiefeM).toBe(0);
    expect(bandForDepth(0.2)?.tiefeM).toBe(0.1);
    expect(bandForDepth(0.5)?.tiefeM).toBe(0.3);
    expect(bandForDepth(1)?.tiefeM).toBe(0.7);
    expect(bandForDepth(3)?.tiefeM).toBe(1.5);
    expect(bandForDepth(-0.5)).toBeUndefined();
  });

  it('die Farben werden von flach nach tief dunkler', () => {
    const luminance = (hex: string) =>
      parseInt(hex.slice(1, 3), 16) +
      parseInt(hex.slice(3, 5), 16) +
      parseInt(hex.slice(5, 7), 16);
    const values = WASSERSTAND_BANDS.map((band) => luminance(band.farbe));
    for (let i = 1; i < values.length; i += 1) {
      expect(values[i]).toBeLessThan(values[i - 1]);
    }
  });
});
