# Spektrum-Erkennung: Verbesserungen Peak-Detection & Nuklid-ID

**Datum:** 2026-04-19
**Scope:** [src/common/spectrumParser.ts](../../src/common/spectrumParser.ts), [src/common/strahlenschutz.ts](../../src/common/strahlenschutz.ts)
**Ziel:** Peak-Detection und Nuklid-Matching näher an der γ-Spektroskopie-Literatur ausrichten — ohne den Algorithmus grundlegend umzubauen.

## Motivation

Der aktuelle Algorithmus (siehe [spectrumParser.ts](../../src/common/spectrumParser.ts)) funktioniert für isolierte, starke Peaks (Am-241, Cs-137), hat aber vier strukturelle Schwächen gegenüber etablierten Methoden (Mariscotti 1967, Currie 1968, SNIP):

1. **Feste Toleranz 10 keV** — CsI(Tl) hat ~12% FWHM @ 662 keV (~80 keV Peak­breite). 10 keV ist bei hohen Energien zu eng (Co-60 1173/1333 werden knapp verfehlt) und bei niedrigen Energien zu weit (Rauschen wird als Ba-133 81 keV gematcht).
2. **Keine Branching Ratios** — Cs-137 @ 662 (85.1%) und Ba-133 @ 356 (62.1%) werden gleich gewichtet wie Peaks mit 3% Intensität. Multi-Peak-Nuklide wie Co-60 sollten beide Peaks im ~1:1-Verhältnis zeigen.
3. **Sample-StdDev statt Poisson** — In der Counting-Statistik gilt σ = √N. Die aktuelle Variance-Berechnung auf Background-Samples unterschätzt σ bei niedrigen Zählraten.
4. **Fenstergrösse fest `windowSize=5`** — Unabhängig von der energie­abhängigen Peakbreite.

## Design

### 1. FWHM-Modell für CsI(Tl) (RadiaCode-101)

Poisson-Statistik liefert FWHM ∝ √E. Mit dem Referenzpunkt 12% @ 662 keV (RadiaCode-Spec):

```ts
// src/common/spectrumParser.ts
export function fwhmAt(
  energyKeV: number,
  referenceResolution = 0.12,
  referenceEnergy = 662,
): number {
  return referenceResolution * Math.sqrt(referenceEnergy * energyKeV);
}
```

Prüfwerte:

| E (keV) | FWHM (keV) | Resolution |
| ------- | ---------- | ---------- |
| 60      | 23.9       | 40%        |
| 356     | 58.2       | 16%        |
| 662     | 79.4       | 12%        |
| 1173    | 105.7      | 9%         |
| 1332    | 112.7      | 8%         |

Die 40% @ 60 keV überschätzen die reale Auflösung (elektronisches Rauschen dominiert dort), sind aber für die Matching-Toleranz unschädlich — wichtig ist, dass die Toleranz nicht unter die echte Peakbreite fällt.

### 2. Energie-abhängige Match-Toleranz

```ts
function toleranceFor(energyKeV: number): number {
  return Math.max(5, 0.5 * fwhmAt(energyKeV));
}
```

Min 5 keV, sonst `HWHM`. Ergibt:

| E (keV) | Toleranz (keV) |
| ------- | -------------- |
| 60      | 12.0           |
| 356     | 29.1           |
| 662     | 39.7           |
| 1173    | 52.8           |
| 1332    | 56.3           |

Der Parameter `toleranceKeV` der `identifyNuclides(peaks, toleranceKeV?)`-API wird zur **Override-Option**. Default = energie­abhängig.

### 3. Branching Ratios im `Nuclide`-Typ

Die `peaks`-Property wird auf strukturierte Einträge umgestellt:

```ts
// src/common/strahlenschutz.ts
export interface NuclidePeak {
  energy: number; // keV
  intensity: number; // 0..1 (fraction of photons per decay)
}

export interface Nuclide {
  name: string;
  gamma: number;
  peaks?: NuclidePeak[];
  url?: string;
}
```

Werte aus NNDC NuDat 3 / IAEA LiveChart (gerundet auf 3 signifikante Stellen):

| Nuklid | Peaks (keV @ intensität)                                                                                |
| ------ | ------------------------------------------------------------------------------------------------------- |
| Am-241 | 59.5 @ 0.359                                                                                            |
| Au-198 | 411.8 @ 0.956                                                                                           |
| Ba-133 | 81 @ 0.329, 276.4 @ 0.072, 302.9 @ 0.183, 356 @ 0.621, 383.8 @ 0.089                                    |
| Co-57  | 122.1 @ 0.856, 136.5 @ 0.107                                                                            |
| Co-60  | 1173.2 @ 0.999, 1332.5 @ 1.000                                                                          |
| Cr-51  | 320.1 @ 0.099                                                                                           |
| Cs-137 | 661.7 @ 0.851                                                                                           |
| Eu-152 | 121.8 @ 0.285, 244.7 @ 0.075, 344.3 @ 0.265, 778.9 @ 0.129, 964.1 @ 0.146, 1112.1 @ 0.136, 1408 @ 0.210 |
| I-125  | 35.5 @ 0.067                                                                                            |
| I-131  | 364.5 @ 0.815                                                                                           |
| Ir-192 | 295.9 @ 0.287, 308.5 @ 0.297, 316.5 @ 0.828, 468.1 @ 0.478                                              |
| Mn-54  | 834.8 @ 1.000                                                                                           |
| Mo-99  | 140.5 @ 0.894, 739.5 @ 0.121                                                                            |
| Na-22  | 511 @ 1.807, 1274.5 @ 0.999                                                                             |
| Ra-226 | 186.2 @ 0.036                                                                                           |
| Se-75  | 136 @ 0.585, 264.7 @ 0.589, 279.5 @ 0.250, 400.7 @ 0.114                                                |
| Tc-99m | 140.5 @ 0.890                                                                                           |
| Zn-65  | 1115.5 @ 0.506                                                                                          |

Downstream-Anpassungen:

- [buildNuclidePeakLines.ts:27](../../src/common/nuclidePeakLines.ts#L27): `for (const energy of ...)` → `for (const { energy } of ...)`
- [EnergySpectrum.tsx:450](../../src/components/pages/EnergySpectrum.tsx#L450): `n.peaks!.join(', ')` → `n.peaks!.map(p => p.energy).join(', ')`

### 4. Intensity-gewichtetes Confidence-Scoring

Aktuell ([spectrumParser.ts:261-262](../../src/common/spectrumParser.ts#L261-L262)):

```
confidence = 0.35·fractionMatched + 0.50·avgStrength + 0.15·avgAccuracy
```

Neu:

```
intensityMatched = Σ(intensity_i  | peak_i matched) / Σ(intensity_i)
confidence = 0.40·intensityMatched + 0.45·avgStrength + 0.15·avgAccuracy
```

Wirkung:

- Cs-137 mit nur dem 662-keV-Peak: `intensityMatched = 1.0` (war `fractionMatched = 1.0` — gleich)
- Co-60 mit nur einem gefundenen Peak: `intensityMatched = 0.5` (beide Peaks nahezu 100%), war `fractionMatched = 0.5` — gleich
- Ba-133 mit nur dem dominanten 356-keV-Peak: `intensityMatched = 0.621 / 1.294 = 0.48` (statt `1/5 = 0.2`) → höhere Confidence, korrekt, weil der dominante Peak das stärkste Erkennungsmerkmal ist

### 5. Poisson-Signifikanz in `findPeaks`

Aktuell: Sample-StdDev der Background-Samples. Neu: Poisson σ = √B, weil Counts Poisson-verteilt sind:

```ts
// Signifikanz-Test: Peak muss über Background + k·√Background liegen
const sigma = Math.sqrt(Math.max(mean, 1));
if (current > mean + significance * sigma) {
  peaks.push({ ... });
}
```

Das entspricht Currie's Critical Level (`LC = k_α · √(2B)` für Netto-Counts; für Gross-Counts vereinfacht sich das zu `B + k·√B`). `significance = 3` (σ) bleibt.

### 6. Nicht im Scope

Bewusst ausgespart (könnte später kommen, liefert aber geringeren Grenznutzen):

- **SNIP Background Subtraction** — iterativer Untergrund­abzug. Lohnt sich nur, wenn Compton-Kontinuum Peaks vollständig verdeckt; aktuell nicht das Problem.
- **Mariscotti 2. Ableitung** — nötig, wenn überlappende Peaks getrennt werden müssen. Bei 18 Nukliden und CsI(Tl)-Auflösung in der Praxis selten relevant.
- **Fenstergrösse FWHM-skaliert** — würde bei hochenergetischen Peaks mehr Statistik einsammeln, aber die aktuellen Tests zeigen keine Detection-Misses bei den Beispielspektren.
- **Interferenz-Matrix** (gleiche Peaks bei mehreren Nukliden, z.B. Tc-99m/Mo-99 @ 140.5) — erst relevant bei quantitativer Analyse.

## Backward Compatibility

- `identifyNuclides(peaks)` bleibt rückwärtskompatibel: `toleranceKeV` wird optional, Default ist energie­abhängig.
- Nuclides ohne `peaks` (z.B. Sr-90) werden weiterhin korrekt übersprungen.
- Bestehende Tests in [spectrumParser.test.ts](../../src/common/spectrumParser.test.ts) müssen nach der Umstellung weiter grün sein (Am-241 und Cs-137 Identifikation).

## Testing

Für jede Änderung TDD:

1. **`fwhmAt`** — Referenzwerte @ 662 keV = 79.4, @ 1332 keV = 112.7.
2. **Nuclide-Struktur** — Ba-133 hat 5 Peaks, davon einer mit intensity 0.621.
3. **`toleranceFor`** — Min 5 keV, HWHM @ 662 = 39.7.
4. **Intensity-Gewichtung** — Ba-133-Match mit nur 356-keV-Peak hat intensityMatched ≈ 0.48.
5. **Poisson-σ** — constructed spectrum mit bekanntem Mean/Peak; 3σ-Schwelle feuert korrekt.
6. **Integration** — `Am-241.xml` → Am-241 als Top-Match; `Cs-137.xml` → Cs-137 als Top-Match; `Co-60.xml` → Co-60 als Top-Match (neu, wenn Co-60.xml verfügbar).

## Referenzen

- Mariscotti (1967): _A method for automatic identification of peaks in the presence of background_, NIM 50, 309-320.
- Currie (1968): _Limits for qualitative detection and quantitative determination_, Anal. Chem. 40, 586-593.
- Ryan et al. (1988): _SNIP, a statistics-sensitive background treatment for the quantitative analysis of PIXE spectra_, NIM B 34, 396-402.
- RadiaCode-101 User Manual: 12%±1% FWHM @ 662 keV.
- NNDC NuDat 3: <https://www.nndc.bnl.gov/nudat3/>
