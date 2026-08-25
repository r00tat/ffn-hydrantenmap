import { describe, expect, it } from 'vitest';
import {
  chooseExaggeration,
  EXAGGERATION_MAX,
  EXAGGERATION_MIN,
  markerLiftM,
  meshBudget,
  texturePx,
} from './gelaende3d';

describe('chooseExaggeration', () => {
  it('hebt flaches Gelände deutlich an', () => {
    // Seewinkel: 5,7 m Relief auf 1 km.
    expect(chooseExaggeration(5.7, 1000)).toBe(EXAGGERATION_MAX);
  });

  it('lässt bewegtes Gelände nahezu unverändert', () => {
    // Wagram: 58,7 m auf 1 km — Faktor 1,7, gerundet 1,5.
    expect(chooseExaggeration(58.7, 1000)).toBe(1.5);
  });

  it('fällt ohne Relief auf 1 zurück', () => {
    expect(chooseExaggeration(0, 1000)).toBe(EXAGGERATION_MIN);
    expect(chooseExaggeration(10, 0)).toBe(EXAGGERATION_MIN);
  });
});

describe('markerLiftM', () => {
  it('wächst mit dem Ausschnitt, bleibt aber sichtbar', () => {
    expect(markerLiftM(10_000)).toBe(150);
    expect(markerLiftM(100)).toBe(8);
  });
});

describe('Budget kleiner Bildschirme', () => {
  it('senkt Vertices und Texturkante auf dem Handy', () => {
    expect(meshBudget(390)).toBeLessThan(meshBudget(1280));
    expect(texturePx(390)).toBe(1024);
  });

  it('lässt Tablet und Desktop beim vollen Budget', () => {
    expect(meshBudget(820)).toBe(65_536);
    expect(texturePx(820)).toBe(2048);
  });
});
