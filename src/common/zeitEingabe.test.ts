import { describe, expect, it } from 'vitest';
import { fromLocalInput, toLocalInput } from './zeitEingabe';

describe('toLocalInput', () => {
  it('formatiert eine Zeit ohne Sekunden und ohne Zeitzone', () => {
    // Lokale Zeit — der Test baut das Datum deshalb aus lokalen Bestandteilen,
    // damit er in jeder Zeitzone gilt.
    const date = new Date(2026, 8, 2, 7, 5);
    expect(toLocalInput(date)).toBe('2026-09-02T07:05');
  });

  it('nimmt auch einen ISO-String', () => {
    const iso = new Date(2026, 11, 31, 23, 59).toISOString();
    expect(toLocalInput(iso)).toBe('2026-12-31T23:59');
  });

  it('ergibt für eine unlesbare Angabe die leere Zeichenkette', () => {
    expect(toLocalInput('kein Datum')).toBe('');
  });
});

describe('fromLocalInput', () => {
  it('rechnet in ISO zurück', () => {
    const erwartet = new Date(2026, 8, 2, 7, 5).toISOString();
    expect(fromLocalInput('2026-09-02T07:05')).toBe(erwartet);
  });

  it('ist bei einer unlesbaren Eingabe undefiniert', () => {
    expect(fromLocalInput('')).toBeUndefined();
    expect(fromLocalInput('kein Datum')).toBeUndefined();
  });
});
