import { describe, expect, it } from 'vitest';
import { finishedPositions } from './finishDrawing';

const a = 'a';
const b = 'b';
const c = 'c';

describe('finishedPositions', () => {
  it('beendet beim Klick auf den letzten Punkt mit den gesetzten Punkten', () => {
    expect(finishedPositions([a, b, c], 2, true)).toEqual([a, b, c]);
    expect(finishedPositions([a, b, c], 2, false)).toEqual([a, b, c]);
  });

  it('beendet auch mit einem einzigen Punkt, der zugleich der letzte ist', () => {
    expect(finishedPositions([a], 0, true)).toEqual([a]);
  });

  it('schließt die Linie beim Klick auf den ersten Punkt zum Ring', () => {
    expect(finishedPositions([a, b, c], 0, true)).toEqual([a, b, c, a]);
  });

  it('beendet die Fläche beim Klick auf den ersten Punkt ohne Doppelpunkt', () => {
    expect(finishedPositions([a, b, c], 0, false)).toEqual([a, b, c]);
  });

  it('beendet beim Klick auf den ersten Punkt erst ab drei Punkten', () => {
    expect(finishedPositions([a, b], 0, true)).toBeUndefined();
    expect(finishedPositions([a, b], 0, false)).toBeUndefined();
  });

  it('beendet nicht beim Klick auf einen Punkt dazwischen', () => {
    expect(finishedPositions([a, b, c], 1, true)).toBeUndefined();
  });
});
