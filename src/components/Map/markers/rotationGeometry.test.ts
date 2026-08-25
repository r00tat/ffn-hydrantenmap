import { describe, expect, it } from 'vitest';
import {
  angleFromPointer,
  normalizeRotation,
  rotationPivotOffset,
} from './rotationGeometry';

describe('normalizeRotation', () => {
  it('liest die als String gespeicherte Drehung', () => {
    expect(normalizeRotation('45')).toBe(45);
    expect(normalizeRotation(45)).toBe(45);
    expect(normalizeRotation('45.5')).toBe(45.5);
  });

  it('liefert 0 für fehlende oder unbrauchbare Werte', () => {
    expect(normalizeRotation(undefined)).toBe(0);
    expect(normalizeRotation('')).toBe(0);
    expect(normalizeRotation('abc')).toBe(0);
  });

  it('holt Werte außerhalb von 0–359 zurück', () => {
    expect(normalizeRotation('-90')).toBe(270);
    expect(normalizeRotation('450')).toBe(90);
    expect(normalizeRotation('720')).toBe(0);
  });
});

describe('rotationPivotOffset', () => {
  it('setzt das Drehzentrum des Fahrzeugs 2,5px rechts und 10px unter die Position', () => {
    // Fahrzeug-Icon: iconSize [45, 20], iconAnchor [20, 0]
    expect(
      rotationPivotOffset({ iconSize: [45, 20], iconAnchor: [20, 0] })
    ).toEqual({
      x: 2.5,
      y: 10,
    });
  });

  it('liefert für ein mittig verankertes Icon keinen Versatz', () => {
    // Rohr-Icon: iconSize [24, 24], iconAnchor [12, 12]
    expect(
      rotationPivotOffset({ iconSize: [24, 24], iconAnchor: [12, 12] })
    ).toEqual({
      x: 0,
      y: 0,
    });
  });

  it('nimmt ohne iconAnchor die Icon-Mitte an', () => {
    expect(rotationPivotOffset({ iconSize: [30, 30] })).toEqual({ x: 0, y: 0 });
  });
});

describe('angleFromPointer', () => {
  const pivot = { x: 100, y: 100 };

  it('zählt vom senkrecht nach oben stehenden Griff im Uhrzeigersinn', () => {
    expect(angleFromPointer(pivot, { x: 100, y: 60 })).toBe(0);
    expect(angleFromPointer(pivot, { x: 140, y: 100 })).toBe(90);
    expect(angleFromPointer(pivot, { x: 100, y: 140 })).toBe(180);
    expect(angleFromPointer(pivot, { x: 60, y: 100 })).toBe(270);
  });

  it('rechnet Zwischenwinkel gradgenau', () => {
    expect(angleFromPointer(pivot, { x: 140, y: 60 })).toBeCloseTo(45);
  });

  it('rastet auf das nächste Vielfache, wenn ein Raster vorgegeben ist', () => {
    expect(angleFromPointer(pivot, { x: 140, y: 60 }, 15)).toBe(45);
    expect(angleFromPointer(pivot, { x: 100, y: 60 }, 15)).toBe(0);
    // 350° liegt näher an 345° als an 360° → kein Sprung über die Naht
    expect(angleFromPointer(pivot, { x: 93, y: 60 }, 15)).toBe(345);
  });

  it('rastet 358° auf 0 statt auf 360', () => {
    expect(angleFromPointer(pivot, { x: 98.6, y: 60 }, 15)).toBe(0);
  });

  it('liefert 0, wenn der Zeiger genau auf dem Drehzentrum liegt', () => {
    expect(angleFromPointer(pivot, { x: 100, y: 100 })).toBe(0);
  });
});
