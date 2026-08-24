import { describe, expect, it } from 'vitest';
import { MAX_CHART_POINTS, thinProfile } from './thinProfile';

const flat = (count: number) =>
  Array.from({ length: count }, (_, index) => ({
    distance: index * 10,
    elevation: 130,
  }));

describe('thinProfile', () => {
  it('lässt ein kurzes Profil unverändert', () => {
    const profile = flat(50);
    expect(thinProfile(profile)).toBe(profile);
  });

  it('hält die Obergrenze ein', () => {
    expect(thinProfile(flat(5000)).length).toBeLessThanOrEqual(
      MAX_CHART_POINTS
    );
  });

  it('behält Anfang und Ende', () => {
    const profile = flat(5000);
    const thinned = thinProfile(profile);
    expect(thinned[0]).toBe(profile[0]);
    expect(thinned[thinned.length - 1]).toBe(profile[profile.length - 1]);
  });

  it('behält eine einzelne Kuppe, die eine gleichmäßige Ausdünnung verschluckt', () => {
    const profile = flat(1000);
    // Ein Punkt fällt aus der Reihe — genau der Fall, um dessen Erkennung es
    // bei der feineren Abtastung geht.
    profile[501] = { distance: 5010, elevation: 190 };
    const thinned = thinProfile(profile, 40);

    expect(thinned.map((point) => point.elevation)).toContain(190);
    // Zum Vergleich: jeder 25. Punkt hätte sie nicht erwischt.
    expect(
      profile.filter((_, index) => index % 25 === 0).map((p) => p.elevation)
    ).not.toContain(190);
  });

  it('behält auch eine einzelne Senke', () => {
    const profile = flat(1000);
    profile[377] = { distance: 3770, elevation: 90 };
    expect(
      thinProfile(profile, 40).map((point) => point.elevation)
    ).toContain(90);
  });

  it('lässt die Streckenmeter aufsteigend', () => {
    const profile = flat(1000).map((point, index) => ({
      ...point,
      elevation: 130 + Math.sin(index / 7) * 20,
    }));
    const thinned = thinProfile(profile, 60);
    for (let i = 1; i < thinned.length; i += 1) {
      expect(thinned[i].distance).toBeGreaterThanOrEqual(
        thinned[i - 1].distance
      );
    }
  });

  it('behält die Spanne des Profils, damit die Höhenachse stimmt', () => {
    const profile = flat(2000).map((point, index) => ({
      ...point,
      elevation: 130 + Math.sin(index / 13) * 20,
    }));
    const thinned = thinProfile(profile);
    const spanne = (points: { elevation: number }[]) => [
      Math.min(...points.map((p) => p.elevation)),
      Math.max(...points.map((p) => p.elevation)),
    ];
    expect(spanne(thinned)).toEqual(spanne(profile));
  });
});
