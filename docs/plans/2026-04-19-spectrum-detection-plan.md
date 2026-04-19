# Spectrum Detection Improvements — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Peak-Detection und Nuklid-Matching in [src/common/spectrumParser.ts](../../src/common/spectrumParser.ts) näher an der Literatur (Mariscotti, Currie) ausrichten, ohne die Architektur umzubauen.

**Architecture:** Vier zusammenhängende Änderungen: (1) FWHM-Modell für CsI(Tl), (2) energie­abhängige Match-Toleranz, (3) Branching-Ratio-Gewichtung im Confidence-Score, (4) Poisson-korrekte Signifikanz. Alle Änderungen sind rückwärtskompatibel; bestehende Tests bleiben grün.

**Tech Stack:** TypeScript, Vitest, keine neuen Dependencies.

**Design:** Siehe [2026-04-19-spectrum-detection-design.md](2026-04-19-spectrum-detection-design.md).

---

## Preconditions

- Branch `feature/spectrum-detection-improvements` ist aktiv (check: `git branch --show-current`).
- `npm run test src/common/spectrumParser.test.ts` läuft baseline grün.
- Beispiel-Spektren unter `examples/Am-241.xml`, `examples/Cs-137.xml`, `examples/Co-60.xml` vorhanden.

Nach jeder Task: **`npm run test` darf nicht regressieren.** Am Ende: **`npm run check`** muss grün sein.

Commit-Konvention: `feat(spektrogramm): <kurz>` oder `refactor(spektrogramm): <kurz>`. Kein Co-Author-Footer.

---

### Task 1: FWHM-Modell hinzufügen

**Files:**
- Modify: `src/common/spectrumParser.ts`
- Test: `src/common/spectrumParser.test.ts`

**Step 1: Failing test**

In `spectrumParser.test.ts` am Ende `describe('fwhmAt', ...)` hinzufügen:

```ts
describe('fwhmAt', () => {
  it('should return 12% FWHM at 662 keV reference', () => {
    expect(fwhmAt(662)).toBeCloseTo(79.44, 1);
  });

  it('should scale with sqrt(E)', () => {
    expect(fwhmAt(1332)).toBeCloseTo(112.7, 0);
    expect(fwhmAt(60)).toBeCloseTo(23.9, 0);
  });

  it('should accept custom reference resolution', () => {
    expect(fwhmAt(662, 0.09)).toBeCloseTo(59.58, 1);
  });
});
```

Import ergänzen: `fwhmAt`.

**Step 2: Run — expect fail**

```bash
npm run test -- spectrumParser
```

Expected: FAIL `fwhmAt is not defined`.

**Step 3: Implement**

In `spectrumParser.ts` nach `channelToEnergy`:

```ts
/**
 * Approximate FWHM of a CsI(Tl) scintillator at the given energy.
 * Poisson-limited statistics give FWHM ∝ √E; 12% @ 662 keV is the
 * RadiaCode-101 reference point.
 */
export function fwhmAt(
  energyKeV: number,
  referenceResolution: number = 0.12,
  referenceEnergy: number = 662,
): number {
  return referenceResolution * Math.sqrt(referenceEnergy * energyKeV);
}
```

**Step 4: Run — expect pass**

```bash
npm run test -- spectrumParser
```

Expected: PASS.

**Step 5: Commit**

```bash
git add src/common/spectrumParser.ts src/common/spectrumParser.test.ts
git commit -m "feat(spektrogramm): FWHM-Modell für CsI(Tl)"
```

---

### Task 2: `Nuclide.peaks` auf `NuclidePeak[]` umstellen

**Files:**
- Modify: `src/common/strahlenschutz.ts` (interface + data)
- Modify: `src/common/nuclidePeakLines.ts`
- Modify: `src/common/spectrumParser.ts` (identifyNuclides)
- Modify: `src/components/pages/EnergySpectrum.tsx` (Tooltip-Anzeige)
- Test: `src/common/strahlenschutz.test.ts` (neu oder erweitert)

**Step 1: Failing test**

In `src/common/strahlenschutz.test.ts` (erstellen falls noch nicht vorhanden):

```ts
import { describe, expect, it } from 'vitest';
import { NUCLIDES } from './strahlenschutz';

describe('NUCLIDES peak data', () => {
  it('Cs-137 has a single peak at 661.7 keV with intensity 0.851', () => {
    const cs137 = NUCLIDES.find((n) => n.name === 'Cs-137')!;
    expect(cs137.peaks).toEqual([{ energy: 661.7, intensity: 0.851 }]);
  });

  it('Co-60 has two peaks near 100% intensity', () => {
    const co60 = NUCLIDES.find((n) => n.name === 'Co-60')!;
    expect(co60.peaks).toHaveLength(2);
    expect(co60.peaks![0].intensity).toBeGreaterThan(0.99);
    expect(co60.peaks![1].intensity).toBeGreaterThan(0.99);
  });

  it('Ba-133 has 356 keV as dominant peak', () => {
    const ba133 = NUCLIDES.find((n) => n.name === 'Ba-133')!;
    const dominant = ba133.peaks!.reduce((a, b) =>
      a.intensity > b.intensity ? a : b,
    );
    expect(dominant.energy).toBe(356);
    expect(dominant.intensity).toBeCloseTo(0.621, 2);
  });
});
```

**Step 2: Run — expect fail**

```bash
npm run test -- strahlenschutz
```

Expected: FAIL — Struktur ist noch `number[]`.

**Step 3: Implement**

`strahlenschutz.ts`:

```ts
export interface NuclidePeak {
  energy: number;   // keV
  intensity: number; // 0..1 (photons per decay)
}

export interface Nuclide {
  name: string;
  gamma: number;
  peaks?: NuclidePeak[];
  url?: string;
}
```

Daten (Werte aus dem Design-Doc, exakt übernehmen):

```ts
export const NUCLIDES: Nuclide[] = [
  { name: 'Am-241', gamma: 3.1, peaks: [{ energy: 59.5, intensity: 0.359 }], url: `${RC}/am-241` },
  { name: 'Au-198', gamma: 62,  peaks: [{ energy: 411.8, intensity: 0.956 }], url: `${RC}/au-198` },
  { name: 'Ba-133', gamma: 52,  peaks: [
    { energy: 81,    intensity: 0.329 },
    { energy: 276.4, intensity: 0.072 },
    { energy: 302.9, intensity: 0.183 },
    { energy: 356,   intensity: 0.621 },
    { energy: 383.8, intensity: 0.089 },
  ], url: `${RC}/ba-133` },
  { name: 'Co-57',  gamma: 16,  peaks: [
    { energy: 122.1, intensity: 0.856 },
    { energy: 136.5, intensity: 0.107 },
  ], url: `${RC}/co-57` },
  { name: 'Co-60',  gamma: 351, peaks: [
    { energy: 1173.2, intensity: 0.999 },
    { energy: 1332.5, intensity: 1.000 },
  ], url: `${RC}/co-60` },
  { name: 'Cr-51',  gamma: 5,   peaks: [{ energy: 320.1, intensity: 0.099 }], url: `${RC}/cr-51` },
  { name: 'Cs-137', gamma: 92,  peaks: [{ energy: 661.7, intensity: 0.851 }], url: `${RC}/cs-137` },
  { name: 'Eu-152', gamma: 168, peaks: [
    { energy: 121.8,  intensity: 0.285 },
    { energy: 244.7,  intensity: 0.075 },
    { energy: 344.3,  intensity: 0.265 },
    { energy: 778.9,  intensity: 0.129 },
    { energy: 964.1,  intensity: 0.146 },
    { energy: 1112.1, intensity: 0.136 },
    { energy: 1408,   intensity: 0.210 },
  ], url: `${RC}/eu-152` },
  { name: 'I-125',  gamma: 17,  peaks: [{ energy: 35.5, intensity: 0.067 }], url: `${RC}/i-125` },
  { name: 'I-131',  gamma: 66,  peaks: [{ energy: 364.5, intensity: 0.815 }], url: `${RC}/i-131` },
  { name: 'Ir-192', gamma: 130, peaks: [
    { energy: 295.9, intensity: 0.287 },
    { energy: 308.5, intensity: 0.297 },
    { energy: 316.5, intensity: 0.828 },
    { energy: 468.1, intensity: 0.478 },
  ], url: `${RC}/ir-192` },
  { name: 'Mn-54',  gamma: 122, peaks: [{ energy: 834.8, intensity: 1.000 }], url: `${RC}/mn-54` },
  { name: 'Mo-99',  gamma: 26,  peaks: [
    { energy: 140.5, intensity: 0.894 },
    { energy: 739.5, intensity: 0.121 },
  ], url: `${RC}/mo-99` },
  { name: 'Na-22',  gamma: 327, peaks: [
    { energy: 511,    intensity: 1.807 },
    { energy: 1274.5, intensity: 0.999 },
  ], url: `${RC}/na-22` },
  { name: 'Ra-226', gamma: 195, peaks: [{ energy: 186.2, intensity: 0.036 }], url: `${RC}/ra-226` },
  { name: 'Se-75',  gamma: 56,  peaks: [
    { energy: 136,   intensity: 0.585 },
    { energy: 264.7, intensity: 0.589 },
    { energy: 279.5, intensity: 0.250 },
    { energy: 400.7, intensity: 0.114 },
  ], url: `${RC}/se-75` },
  { name: 'Sr-90',  gamma: 6, url: `${RC}/sr-90` },
  { name: 'Tc-99m', gamma: 17,  peaks: [{ energy: 140.5, intensity: 0.890 }], url: `${RC}/tc-99m` },
  { name: 'Zn-65',  gamma: 82,  peaks: [{ energy: 1115.5, intensity: 0.506 }], url: `${RC}/zn-65` },
];
```

**Step 4: Update all usages**

`src/common/nuclidePeakLines.ts:27` — ersetze
```ts
for (const energy of nuclide.peaks) {
```
mit
```ts
for (const { energy } of nuclide.peaks) {
```

`src/common/spectrumParser.ts` `identifyNuclides`: Statt `for (const expectedEnergy of nuclide.peaks)` jetzt `for (const { energy: expectedEnergy } of nuclide.peaks)`. (Intensity wird in Task 4 genutzt.)

`src/components/pages/EnergySpectrum.tsx:450` — ersetze
```tsx
{n.name}: {n.peaks!.join(', ')} keV
```
mit
```tsx
{n.name}: {n.peaks!.map((p) => p.energy).join(', ')} keV
```

**Step 5: Run — expect pass**

```bash
npm run test
```

Expected: Alle Tests (alt + neu) grün.

**Step 6: Commit**

```bash
git add src/common/strahlenschutz.ts src/common/strahlenschutz.test.ts src/common/nuclidePeakLines.ts src/common/spectrumParser.ts src/components/pages/EnergySpectrum.tsx
git commit -m "refactor(strahlenschutz): Nuclide-Peaks mit Branching Ratios"
```

---

### Task 3: Energie-abhängige Match-Toleranz

**Files:**
- Modify: `src/common/spectrumParser.ts`
- Test: `src/common/spectrumParser.test.ts`

**Step 1: Failing test**

```ts
describe('toleranceFor (energy-dependent match tolerance)', () => {
  it('should return HWHM at high energies', () => {
    expect(toleranceFor(662)).toBeCloseTo(39.7, 1);
    expect(toleranceFor(1332)).toBeCloseTo(56.4, 1);
  });

  it('should enforce a minimum of 5 keV at low energies', () => {
    expect(toleranceFor(5)).toBe(5);
  });
});

describe('identifyNuclides with energy-dependent tolerance', () => {
  it('should match Co-60 1332 keV peak within HWHM', () => {
    // constructed peak offset by 30 keV from expected 1332 — within HWHM (~56)
    const peaks: Peak[] = [
      { channel: 560, energy: 1362, counts: 1000 },
      { channel: 490, energy: 1200, counts: 1000 },
    ];
    const matches = identifyNuclides(peaks);
    const co60 = matches.find((m) => m.nuclide.name === 'Co-60');
    expect(co60?.matchedPeaks.length).toBeGreaterThanOrEqual(1);
  });
});
```

Import `toleranceFor`, `Peak` aus `spectrumParser`.

**Step 2: Run — expect fail**

```bash
npm run test -- spectrumParser
```

Expected: FAIL `toleranceFor is not defined`.

**Step 3: Implement**

In `spectrumParser.ts` nach `fwhmAt`:

```ts
/**
 * Energy-dependent match tolerance. Defaults to HWHM for CsI(Tl) with a
 * 5 keV floor so very low energies remain matchable despite small FWHM.
 */
export function toleranceFor(energyKeV: number): number {
  return Math.max(5, 0.5 * fwhmAt(energyKeV));
}
```

In `identifyNuclides` die Signatur so ändern, dass `toleranceKeV` optional ist und — wenn weggelassen — pro Peak energie­abhängig genutzt wird:

```ts
export function identifyNuclides(
  peaks: Peak[],
  toleranceKeV?: number,
  nuclides: Nuclide[] = NUCLIDES,
): NuclideMatch[] {
  // ...
  for (const { energy: expectedEnergy, intensity } of nuclide.peaks) {
    const tolerance = toleranceKeV ?? toleranceFor(expectedEnergy);
    let bestPeak: Peak | null = null;
    let bestDistance = tolerance;

    for (const peak of peaks) {
      const distance = Math.abs(peak.energy - expectedEnergy);
      if (distance < bestDistance) {
        bestDistance = distance;
        bestPeak = peak;
      }
    }
    // ...
  }
}
```

`avgAccuracy` muss pro Peak relativ zur jeweiligen Toleranz berechnet werden:

```ts
const avgAccuracy =
  1 -
  matchedPeaks.reduce(
    (sum, mp) =>
      sum + Math.abs(mp.found.energy - mp.expected) / (toleranceKeV ?? toleranceFor(mp.expected)),
    0,
  ) / matchedPeaks.length;
```

**Step 4: Run — expect pass**

```bash
npm run test
```

Expected: Alle Tests grün.

**Step 5: Commit**

```bash
git add src/common/spectrumParser.ts src/common/spectrumParser.test.ts
git commit -m "feat(spektrogramm): energie-abhängige Match-Toleranz (HWHM)"
```

---

### Task 4: Branching-Ratio-gewichtetes Confidence-Scoring

**Files:**
- Modify: `src/common/spectrumParser.ts`
- Test: `src/common/spectrumParser.test.ts`

**Step 1: Failing test**

```ts
describe('identifyNuclides with intensity weighting', () => {
  it('should give Ba-133 high confidence for dominant 356 keV match only', () => {
    const peaks: Peak[] = [
      { channel: 150, energy: 356, counts: 1000 },
    ];
    const matches = identifyNuclides(peaks);
    const ba133 = matches.find((m) => m.nuclide.name === 'Ba-133');
    expect(ba133).toBeDefined();
    // intensityMatched = 0.621 / (0.329+0.072+0.183+0.621+0.089) = 0.48
    // confidence = 0.40*0.48 + 0.45*1.0 + 0.15*~1.0 ≈ 0.79
    expect(ba133!.confidence).toBeGreaterThan(0.7);
  });

  it('should give Co-60 partial confidence for one-of-two peaks', () => {
    const peaks: Peak[] = [
      { channel: 500, energy: 1332.5, counts: 1000 },
    ];
    const matches = identifyNuclides(peaks);
    const co60 = matches.find((m) => m.nuclide.name === 'Co-60');
    expect(co60).toBeDefined();
    // intensityMatched ≈ 0.5
    expect(co60!.confidence).toBeGreaterThan(0.4);
    expect(co60!.confidence).toBeLessThan(0.85);
  });
});
```

**Step 2: Run — expect fail (or pass spuriously)**

```bash
npm run test -- spectrumParser
```

Je nach aktuellem Score kann einer der Tests schon passen; beide müssen nach der Umstellung grün sein.

**Step 3: Implement**

In `identifyNuclides` den Score neu zusammensetzen:

```ts
const totalIntensity = nuclide.peaks.reduce((s, p) => s + p.intensity, 0);
const matchedIntensity = matchedPeaks.reduce((s, mp) => {
  const np = nuclide.peaks!.find((p) => p.energy === mp.expected);
  return s + (np?.intensity ?? 0);
}, 0);
const intensityMatched = totalIntensity > 0 ? matchedIntensity / totalIntensity : 0;

const avgStrength =
  matchedPeaks.reduce((sum, mp) => sum + mp.found.counts, 0) /
  matchedPeaks.length /
  maxPeakCounts;

// avgAccuracy wie in Task 3

const confidence =
  0.40 * intensityMatched + 0.45 * avgStrength + 0.15 * avgAccuracy;
```

**Step 4: Run — expect pass**

```bash
npm run test
```

Expected: Alle Tests grün, inkl. vorhandene Am-241/Cs-137-Tests.

**Step 5: Commit**

```bash
git add src/common/spectrumParser.ts src/common/spectrumParser.test.ts
git commit -m "feat(spektrogramm): Branching Ratio gewichtet Confidence-Score"
```

---

### Task 5: Poisson-korrekte Signifikanz in `findPeaks`

**Files:**
- Modify: `src/common/spectrumParser.ts`
- Test: `src/common/spectrumParser.test.ts`

**Step 1: Failing test**

Konstruiertes Spektrum mit bekanntem Background-Mean:

```ts
describe('findPeaks Poisson significance', () => {
  it('should reject a peak at background+2·√B', () => {
    const counts = new Array(200).fill(100);       // mean = 100, sqrt(B) = 10
    counts[100] = 120;                             // 2σ — unter 3σ-Schwelle
    const energies = counts.map((_, i) => i * 3);
    const peaks = findPeaks(counts, energies, { minEnergy: 0 });
    expect(peaks.find((p) => p.channel === 100)).toBeUndefined();
  });

  it('should accept a peak at background+5·√B', () => {
    const counts = new Array(200).fill(100);
    counts[100] = 150;                             // 5σ
    const energies = counts.map((_, i) => i * 3);
    const peaks = findPeaks(counts, energies, { minEnergy: 0 });
    expect(peaks.find((p) => p.channel === 100)).toBeDefined();
  });
});
```

**Step 2: Run — expect fail**

```bash
npm run test -- spectrumParser
```

Mit aktueller Sample-StdDev-Logik können diese Tests durchfallen oder falsch positiv sein (flat background → stddev = 0 → beide werden akzeptiert).

**Step 3: Implement**

In `findPeaks` die Varianz-Berechnung durch Poisson-σ ersetzen:

```ts
if (count === 0) continue;
const mean = sum / count;
const sigma = Math.sqrt(Math.max(mean, 1));

if (current > mean + significance * sigma) {
  peaks.push({
    channel: i,
    energy: energies[i],
    counts: counts[i],
  });
}
```

(Die aktuelle `varianceSum`-Schleife wird entfernt.)

**Step 4: Run — expect pass**

```bash
npm run test
```

Expected: Alle Tests grün — insbesondere Am-241 und Cs-137 finden ihre Peaks weiterhin.

**Step 5: Commit**

```bash
git add src/common/spectrumParser.ts src/common/spectrumParser.test.ts
git commit -m "feat(spektrogramm): Poisson-σ für Peak-Signifikanz"
```

---

### Task 6: Integration Check & End-to-End Verifikation

**Files:** keine (nur Verifikation)

**Step 1: Alle Tests grün**

```bash
npm run test
```

Expected: 0 failures.

**Step 2: Lint + Typecheck + Build**

```bash
npm run check
```

Expected: 0 errors, 0 warnings.

**Step 3: Manual smoke test mit Beispielspektren (via Unit-Test)**

Falls noch nicht vorhanden, in `spectrumParser.test.ts` ergänzen:

```ts
describe('identifyNuclides with example spectra', () => {
  it('ranks Am-241 as top match for Am-241.xml', () => {
    const data = parseSpectrumXml(AM241_XML);
    const peaks = findPeaks(data.counts, data.energies);
    const matches = identifyNuclides(peaks);
    expect(matches[0].nuclide.name).toBe('Am-241');
  });

  it('ranks Cs-137 as top match for Cs-137.xml', () => {
    const data = parseSpectrumXml(CS137_XML);
    const peaks = findPeaks(data.counts, data.energies);
    const matches = identifyNuclides(peaks);
    expect(matches[0].nuclide.name).toBe('Cs-137');
  });
});
```

Falls `examples/Co-60.xml` vorhanden, analoger Test.

```bash
npm run test
```

Expected: PASS.

**Step 4: Commit (falls Tests ergänzt)**

```bash
git add src/common/spectrumParser.test.ts
git commit -m "test(spektrogramm): Top-Match-Ranking für Beispielspektren"
```

---

## Done-Criteria

- [x] `npm run check` grün
- [x] Alle bestehenden Tests grün
- [x] Am-241, Cs-137, Co-60 Beispielspektren → korrekter Top-Match
- [x] 6 Commits entlang der Tasks
- [x] Branch bereit für PR gegen `main`
