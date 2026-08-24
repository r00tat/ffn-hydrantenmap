// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import {
  contourWeight,
  EQUIDISTANCE_CHOICES,
  EQUIDISTANCE_STORAGE_KEY,
  equidistanceForZoom,
  readEquidistanceChoice,
  resolveEquidistance,
} from './hoehenlinien';

describe('equidistanceForZoom', () => {
  it('folgt der Staffel', () => {
    expect(equidistanceForZoom(19)).toBe(0.5);
    expect(equidistanceForZoom(18)).toBe(0.5);
    expect(equidistanceForZoom(17)).toBe(1);
    expect(equidistanceForZoom(16)).toBe(2);
    expect(equidistanceForZoom(15)).toBe(5);
    expect(equidistanceForZoom(14)).toBe(10);
    expect(equidistanceForZoom(9)).toBe(10);
  });

  it('wird mit dem Hinauszoomen gröber, nie feiner', () => {
    for (let zoom = 10; zoom < 19; zoom += 1) {
      expect(equidistanceForZoom(zoom)).toBeLessThanOrEqual(
        equidistanceForZoom(zoom - 1)
      );
    }
  });
});

describe('resolveEquidistance', () => {
  it('nimmt bei auto die Zoomstufe', () => {
    expect(resolveEquidistance('auto', 17)).toBe(1);
  });

  it('übersteuert die Zoomstufe bei manueller Wahl', () => {
    expect(resolveEquidistance('0.5', 14)).toBe(0.5);
    expect(resolveEquidistance('10', 19)).toBe(10);
  });
});

describe('readEquidistanceChoice', () => {
  afterEach(() => {
    window.localStorage.removeItem(EQUIDISTANCE_STORAGE_KEY);
  });

  it('gibt ohne gespeicherte Wahl auto', () => {
    expect(readEquidistanceChoice()).toBe('auto');
  });

  it('gibt die gespeicherte Wahl zurück', () => {
    window.localStorage.setItem(EQUIDISTANCE_STORAGE_KEY, '2');
    expect(readEquidistanceChoice()).toBe('2');
  });

  it('verwirft unbrauchbaren Inhalt statt ihn weiterzugeben', () => {
    // Sonst landet ein `Number('vielleicht')` als NaN in der Anfrage.
    window.localStorage.setItem(EQUIDISTANCE_STORAGE_KEY, 'vielleicht');
    expect(readEquidistanceChoice()).toBe('auto');
  });

  it('kennt jede angebotene Wahl', () => {
    for (const choice of EQUIDISTANCE_CHOICES) {
      window.localStorage.setItem(EQUIDISTANCE_STORAGE_KEY, choice);
      expect(readEquidistanceChoice()).toBe(choice);
    }
  });
});

describe('contourWeight', () => {
  it('zeichnet Vollmeterlinien stärker als Zwischenlinien', () => {
    expect(contourWeight(132)).toBeGreaterThan(contourWeight(132.5));
  });
});
