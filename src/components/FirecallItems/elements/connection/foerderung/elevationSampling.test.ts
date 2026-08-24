// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import type { LatLngPosition } from '../../../../../common/geo';
import {
  FALLBACK_SAMPLING,
  FINE_SAMPLING,
  MAX_ELEVATION_SAMPLES,
  sampleAlongPath,
  TARGET_SAMPLE_SPACING_M,
} from './elevationSampling';

/** Neusiedl am See: rund 111 m je 0,001° Breite. */
const start: LatLngPosition = [47.9482, 16.8482];
const northOf = (metres: number): LatLngPosition => [
  start[0] + metres / 111_320,
  start[1],
];

describe('sampleAlongPath', () => {
  it('gibt bei kurzer Strecke nur Anfang und Ende', () => {
    const samples = sampleAlongPath([start, northOf(30)]);
    expect(samples).toHaveLength(2);
    expect(samples[0].distance).toBe(0);
    expect(samples[1].distance).toBeCloseTo(30, 0);
  });

  it('behält die gesetzten Endpunkte unverändert', () => {
    const end = northOf(1000);
    const samples = sampleAlongPath([start, end]);
    expect(samples[0].position).toEqual(start);
    expect(samples[samples.length - 1].position).toEqual(end);
  });

  it('tastet im angestrebten Abstand ab', () => {
    const samples = sampleAlongPath([start, northOf(1000)]);
    // 1000 m / 50 m + 1 = 21 Punkte
    expect(samples).toHaveLength(21);
    const spacing = samples[1].distance - samples[0].distance;
    expect(spacing).toBeCloseTo(TARGET_SAMPLE_SPACING_M, 0);
  });

  it('hält die Abstände untereinander gleich', () => {
    const samples = sampleAlongPath([start, northOf(2000)]);
    const spacings = samples
      .slice(1)
      .map((sample, index) => sample.distance - samples[index].distance);
    const first = spacings[0];
    spacings.forEach((spacing) => expect(spacing).toBeCloseTo(first, 6));
  });

  it('steigt in der Streckenmeter-Angabe monoton', () => {
    const samples = sampleAlongPath([start, northOf(600), northOf(300)]);
    samples.slice(1).forEach((sample, index) => {
      expect(sample.distance).toBeGreaterThan(samples[index].distance);
    });
  });

  it('deckelt lange Leitungen bei 100 Punkten', () => {
    const samples = sampleAlongPath([start, northOf(20_000)]);
    expect(samples).toHaveLength(MAX_ELEVATION_SAMPLES);
    // Der Abstand wächst dann über die angestrebten 50 m hinaus.
    expect(samples[1].distance - samples[0].distance).toBeGreaterThan(
      TARGET_SAMPLE_SPACING_M
    );
  });

  it('folgt einer Linie mit Knick über die Stützpunkte hinweg', () => {
    const knick: LatLngPosition = [start[0], start[1] + 0.01];
    const samples = sampleAlongPath([start, knick, northOf(500)]);
    expect(samples[0].position).toEqual(start);
    expect(samples[samples.length - 1].position).toEqual(northOf(500));
    // Irgendein Abtastpunkt muss östlich vom Anfang liegen, sonst wurde der
    // Knick übersprungen.
    expect(samples.some((sample) => sample.position[1] > start[1])).toBe(true);
  });

  it('tastet mit der feinen Vorgabe alle 10 m ab', () => {
    const samples = sampleAlongPath([start, northOf(1000)], FINE_SAMPLING);
    expect(samples).toHaveLength(101);
    expect(samples[1].distance - samples[0].distance).toBeCloseTo(10, 0);
  });

  it('hält den Deckel der feinen Abtastung ein', () => {
    // 200 km wären bei 10 m Abstand 20.000 Punkte; der Deckel greift.
    const samples = sampleAlongPath([start, northOf(200_000)], FINE_SAMPLING);
    expect(samples).toHaveLength(FINE_SAMPLING.maxSamples);
  });

  it('bleibt ohne Angabe bei der groben Vorgabe', () => {
    // Damit fordert ein Aufrufer ohne Angabe nicht unversehens 5.000 Punkte an.
    expect(sampleAlongPath([start, northOf(20_000)])).toHaveLength(
      MAX_ELEVATION_SAMPLES
    );
    expect(FALLBACK_SAMPLING.spacingM).toBe(TARGET_SAMPLE_SPACING_M);
  });

  it('gibt auf derselben Leitung mehr Punkte als die grobe Abtastung', () => {
    const line: [LatLngPosition, LatLngPosition] = [start, northOf(2000)];
    expect(sampleAlongPath(line, FINE_SAMPLING).length).toBeGreaterThan(
      sampleAlongPath(line, FALLBACK_SAMPLING).length
    );
  });

  it('verträgt zu wenige oder unbrauchbare Punkte', () => {
    expect(sampleAlongPath([])).toEqual([]);
    expect(sampleAlongPath([start])).toEqual([{ position: start, distance: 0 }]);
    expect(sampleAlongPath([start, start])).toHaveLength(2);
  });
});
