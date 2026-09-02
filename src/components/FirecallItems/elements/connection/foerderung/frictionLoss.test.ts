import { describe, expect, it } from 'vitest';
import {
  COUPLING_REFERENCE_FLOW,
  canonicalDimension,
  frictionBreakdownPer100m,
  frictionLossPer100m,
  HOSE_DIAMETERS,
  hoseInnerDiameterMm,
  splitDimension,
} from './frictionLoss';

describe('hoseInnerDiameterMm', () => {
  it('erkennt die Kurzbezeichnungen', () => {
    expect(hoseInnerDiameterMm('B')).toBe(75);
    expect(hoseInnerDiameterMm('b')).toBe(75);
    expect(hoseInnerDiameterMm('A')).toBe(110);
    expect(hoseInnerDiameterMm('C')).toBe(52);
    expect(hoseInnerDiameterMm('D')).toBe(25);
    expect(hoseInnerDiameterMm('F')).toBe(152);
  });

  it('erkennt die Schreibweisen mit ausgeschriebenem Durchmesser', () => {
    expect(hoseInnerDiameterMm('C 42')).toBe(42);
    expect(hoseInnerDiameterMm('C-42')).toBe(42);
    expect(hoseInnerDiameterMm('C42')).toBe(42);
    expect(hoseInnerDiameterMm('B 75')).toBe(75);
  });

  it('gibt undefined für Unbekanntes', () => {
    expect(hoseInnerDiameterMm('X')).toBeUndefined();
    expect(hoseInnerDiameterMm('Storz')).toBeUndefined();
    expect(hoseInnerDiameterMm('')).toBeUndefined();
    expect(hoseInnerDiameterMm(undefined)).toBeUndefined();
  });
});

describe('frictionLossPer100m für B 75', () => {
  // Die belegte Tabelle: FF Ebersdorf, „Tabellen für Löschwasserförderung",
  // Stand 07/2020. Diese sieben Werte müssen exakt stimmen — sie sind die
  // Zahlen, mit denen ausgebildet wird.
  it.each([
    [200, 0.1],
    [400, 0.25],
    [600, 0.5],
    [800, 1.0],
    [1000, 1.5],
    [1200, 2.5],
    [1600, 5.0],
  ])('gibt bei %i l/min den Tabellenwert %f zurück', (flow, expected) => {
    expect(frictionLossPer100m(flow, 'B')).toBeCloseTo(expected, 6);
  });

  it('interpoliert zwischen den Stützstellen über Q²', () => {
    // (900² − 800²) / (1000² − 800²) = 0,4722 → 1,00 + 0,50 · 0,4722
    expect(frictionLossPer100m(900, 'B')).toBeCloseTo(1.2361, 3);
  });

  it('bleibt bei der Interpolation zwischen den Nachbarwerten', () => {
    for (const flow of [300, 500, 700, 900, 1100, 1400]) {
      const value = frictionLossPer100m(flow, 'B') as number;
      expect(value).toBeGreaterThan(frictionLossPer100m(flow - 100, 'B') as number);
      expect(value).toBeLessThan(frictionLossPer100m(flow + 100, 'B') as number);
    }
  });

  it('extrapoliert über der letzten Stützstelle mit Q²', () => {
    // 5,00 · (2000/1600)²
    expect(frictionLossPer100m(2000, 'B')).toBeCloseTo(7.8125, 4);
  });

  it('extrapoliert unter der ersten Stützstelle mit Q²', () => {
    // 0,10 · (100/200)²
    expect(frictionLossPer100m(100, 'B')).toBeCloseTo(0.025, 4);
  });

  it('ist bei Menge 0 verlustfrei', () => {
    expect(frictionLossPer100m(0, 'B')).toBe(0);
  });
});

describe('frictionLossPer100m für andere Dimensionen', () => {
  it('skaliert C 52 mit (75/52)^5', () => {
    // 1,00 · 6,2413
    expect(frictionLossPer100m(800, 'C')).toBeCloseTo(6.2413, 2);
  });

  it('bleibt bei C 52 in der Nähe des veröffentlichten Werts von 6,5', () => {
    // Gegenprüfung gegen die deutsche Literatur: dort 6,5 bar/100 m bei
    // 800 l/min. Die Ableitung darf nicht mehr als 15 % daneben liegen.
    const value = frictionLossPer100m(800, 'C') as number;
    expect(value).toBeGreaterThan(6.5 * 0.85);
    expect(value).toBeLessThan(6.5 * 1.15);
  });

  it('macht A 110 deutlich verlustärmer als B 75', () => {
    const a = frictionLossPer100m(1000, 'A') as number;
    expect(a).toBeGreaterThan(0.15);
    expect(a).toBeLessThan(0.35);
    expect(a).toBeLessThan(frictionLossPer100m(1000, 'B') as number);
  });

  it('macht C 42 verlustreicher als C 52', () => {
    expect(frictionLossPer100m(400, 'C 42') as number).toBeGreaterThan(
      frictionLossPer100m(400, 'C') as number
    );
  });

  it('gibt undefined für eine Dimension ohne bekannten Durchmesser', () => {
    expect(frictionLossPer100m(800, 'X')).toBeUndefined();
    expect(frictionLossPer100m(800, undefined)).toBeUndefined();
  });
});


describe('canonicalDimension / splitDimension', () => {
  it('lässt den Buchstaben allein stehen, wenn die mm der Standardwert sind', () => {
    expect(canonicalDimension('C', 52)).toBe('C');
    expect(canonicalDimension('B', 75)).toBe('B');
    expect(canonicalDimension('B')).toBe('B');
  });

  it('schreibt die Zahl aus, wenn sie abweicht', () => {
    expect(canonicalDimension('C', 42)).toBe('C 42');
    expect(canonicalDimension('B', 90)).toBe('B 90');
  });

  it('liest Buchstabe und Durchmesser zurück', () => {
    expect(splitDimension('C 42')).toEqual({ letter: 'C', diameterMm: 42 });
    expect(splitDimension('B')).toEqual({ letter: 'B', diameterMm: 75 });
    expect(splitDimension('c-42')).toEqual({ letter: 'C', diameterMm: 42 });
  });

  it('gibt für Unlesbares nichts zurück, statt zu raten', () => {
    expect(splitDimension('Storz')).toEqual({});
    expect(splitDimension(undefined)).toEqual({});
  });

  it('läuft für jede bekannte Dimension rund', () => {
    for (const [letter, mm] of Object.entries(HOSE_DIAMETERS)) {
      const canonical = canonicalDimension(letter, mm);
      expect(canonical).toBe(letter);
      expect(splitDimension(canonical)).toEqual({ letter, diameterMm: mm });
    }
  });
});

describe('frictionBreakdownPer100m mit der Tabelle', () => {
  it('ist ohne Optionen der bisherige Tabellenweg, ohne Kupplungen', () => {
    const b = frictionBreakdownPer100m(800, 'B');
    expect(b?.rohr).toBeCloseTo(1.0, 6);
    expect(b?.kupplungen).toBe(0);
    expect(b?.total).toBeCloseTo(1.0, 6);
    expect(b?.source).toBe('table');
  });

  it('weist die d⁵-Skalierung als abgeleitet aus', () => {
    expect(frictionBreakdownPer100m(800, 'C')?.source).toBe('derived');
  });

  it('rechnet auch mit gesetztem Kupplungswert keine Kupplungen dazu', () => {
    // Die AT-Tabelle ist an echten Schlauchleitungen gemessen — die
    // Kupplungen stecken dort schon drin. Ein Aufschlag zählte doppelt.
    const b = frictionBreakdownPer100m(1600, 'B', {
      model: 'table',
      couplingBarAtNominal: 0.05,
    });
    expect(b?.kupplungen).toBe(0);
    expect(b?.total).toBeCloseTo(5.0, 6);
  });
});

describe('frictionBreakdownPer100m mit Rohrhydraulik', () => {
  const model = { model: 'colebrook' as const, roughnessMm: 0.03 };

  // Unabhängig nachgerechnet (Swamee-Jain, ν = 1,31e-6 bei 10 °C, ρ = 1000).
  // Die Re-Werte dieser Mengen stimmen mit denen in
  // docs/loeschwasserfoerderung.md überein — dieselbe Stoffannahme.
  it.each([
    [800, 1.134],
    [1000, 1.731],
    [1600, 4.259],
  ])('rechnet B 75 bei %i l/min auf %f bar je 100 m', (flow, expected) => {
    expect(frictionBreakdownPer100m(flow, 'B', model)?.rohr).toBeCloseTo(
      expected,
      2
    );
  });

  it('weist die Herkunft als Modell aus, auch bei B 75', () => {
    expect(frictionBreakdownPer100m(800, 'B', model)?.source).toBe('model');
  });

  it('reproduziert mit k ≈ 0,004 mm den AT-Anker bei 800 l/min', () => {
    // Der Befund, der die Tabelle einordnet: Sie ist bei 800 l/min
    // hydraulisch glatt. Ein Modell mit Praxisrauheit liegt darüber.
    const value = frictionBreakdownPer100m(800, 'B', {
      model: 'colebrook',
      roughnessMm: 0.004,
    })?.rohr;
    expect(value).toBeCloseTo(1.0, 2);
  });

  it('wächst mit der Rauheit', () => {
    const rough = frictionBreakdownPer100m(1000, 'B', {
      model: 'colebrook',
      roughnessMm: 0.5,
    })?.rohr as number;
    const smooth = frictionBreakdownPer100m(1000, 'B', {
      model: 'colebrook',
      roughnessMm: 0.01,
    })?.rohr as number;
    expect(rough).toBeGreaterThan(smooth);
  });

  it('rechnet nicht mehr über die d⁵-Skalierung', () => {
    // C 52 im Modell ist nicht der B-75-Tabellenwert mal (75/52)⁵.
    const modelled = frictionBreakdownPer100m(800, 'C', model)?.rohr as number;
    const derived = frictionBreakdownPer100m(800, 'C')?.total as number;
    expect(derived).toBeCloseTo(6.24, 1);
    expect(modelled).toBeCloseTo(7.2, 1);
    expect(Math.abs(modelled - derived)).toBeGreaterThan(0.5);
  });

  it('rechnet unter Re 2300 laminar — der Verlust wird dort linear in Q', () => {
    // Laminar gilt λ = 64/Re, damit ist Δp ∝ Q statt ∝ Q².
    const one = frictionBreakdownPer100m(1, 'D', model)?.rohr as number;
    const two = frictionBreakdownPer100m(2, 'D', model)?.rohr as number;
    expect(two / one).toBeCloseTo(2, 6);
  });

  it('ist bei Menge 0 verlustfrei', () => {
    expect(frictionBreakdownPer100m(0, 'B', model)?.total).toBe(0);
  });

  it('rechnet nicht bei unbekannter Dimension', () => {
    expect(frictionBreakdownPer100m(800, 'Storz', model)).toBeUndefined();
  });
});

describe('Kupplungsverluste im Modell', () => {
  const options = {
    model: 'colebrook' as const,
    roughnessMm: 0.03,
    couplingBarAtNominal: 0.05,
    hoseLengthM: 20,
  };

  // 0,05 bar je Kupplung bei 1000 l/min, 5 Kupplungen je 100 m.
  it.each([
    [800, 0.16],
    [1000, 0.25],
    [1600, 0.64],
  ])('rechnet bei %i l/min %f bar je 100 m an Kupplungen', (flow, expected) => {
    expect(frictionBreakdownPer100m(flow, 'B', options)?.kupplungen).toBeCloseTo(
      expected,
      3
    );
  });

  it('skaliert mit Q², nicht linear', () => {
    const at1000 = frictionBreakdownPer100m(1000, 'B', options)
      ?.kupplungen as number;
    const at2000 = frictionBreakdownPer100m(2000, 'B', options)
      ?.kupplungen as number;
    expect(at2000 / at1000).toBeCloseTo(4, 6);
  });

  it('hängt an der Schlauchlänge, nicht an der Dimension', () => {
    const short = frictionBreakdownPer100m(1000, 'B', options)
      ?.kupplungen as number;
    const long = frictionBreakdownPer100m(1000, 'B', {
      ...options,
      hoseLengthM: 40,
    })?.kupplungen as number;
    expect(long).toBeCloseTo(short / 2, 6);
  });

  it('bleibt unberührt vom Pumpennennstrom — Bezug sind fest 1000 l/min', () => {
    expect(COUPLING_REFERENCE_FLOW).toBe(1000);
  });

  it('erklärt bei 1600 l/min die Lücke des reinen Rohrmodells zur Tabelle', () => {
    // Rohr allein liegt 15 % unter der Tabelle; mit den Kupplungen sind es 2 %.
    // Das ist die Rechtfertigung, den Kupplungsverlust überhaupt zu führen.
    const total = frictionBreakdownPer100m(1600, 'B', options)?.total as number;
    const table = frictionBreakdownPer100m(1600, 'B')?.total as number;
    expect(table).toBeCloseTo(5.0, 6);
    expect(total).toBeCloseTo(4.9, 1);
    expect(Math.abs(total - table) / table).toBeLessThan(0.03);
  });
});

describe('frictionLossPer100m bleibt die Summe', () => {
  it('gibt die Zahl und nicht die Aufschlüsselung', () => {
    expect(frictionLossPer100m(800, 'B')).toBeCloseTo(1.0, 6);
  });

  it('enthält die Kupplungen, wenn das Modell aktiv ist', () => {
    const total = frictionLossPer100m(1600, 'B', {
      model: 'colebrook',
      roughnessMm: 0.03,
      couplingBarAtNominal: 0.05,
      hoseLengthM: 20,
    }) as number;
    expect(total).toBeCloseTo(4.899, 2);
  });
});
