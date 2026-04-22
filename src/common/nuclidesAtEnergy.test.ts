import { describe, expect, it } from 'vitest';
import { nuclidesAtEnergy } from './nuclidesAtEnergy';

describe('nuclidesAtEnergy', () => {
  it('matches Cs-137 in der Naehe seiner 662-keV-Linie', () => {
    const hits = nuclidesAtEnergy(660);
    expect(hits.some((h) => h.nuclide.name.startsWith('Cs-137'))).toBe(true);
  });

  it('liefert bei sehr hoher Energie keine Treffer', () => {
    expect(nuclidesAtEnergy(9000)).toHaveLength(0);
  });

  it('sortiert Treffer nach distance/intensity (best match zuerst)', () => {
    // Just below Cs-137 661.7 keV — Cs-137 should be sortiert vor anderen
    // Kandidaten im gleichen Fenster.
    const hits = nuclidesAtEnergy(660);
    if (hits.length >= 2) {
      const [first, second] = hits;
      expect(
        first.distanceKev / first.intensity <=
          second.distanceKev / second.intensity,
      ).toBe(true);
    }
  });

  it('filtert Nuklide ohne Peaks aus', () => {
    // The query should only ever contain nuclides with a peak within tolerance.
    const hits = nuclidesAtEnergy(500);
    for (const h of hits) {
      expect(h.nuclide.peaks).toBeTruthy();
      expect(h.nuclide.peaks!.length).toBeGreaterThan(0);
    }
  });
});
