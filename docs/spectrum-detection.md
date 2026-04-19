# Gamma-Spektrum-Erkennung

Technische Beschreibung der Peak-Detection und Nuklid-Identifikation für RadiaCode-101-Spektren.

**Letzte Aktualisierung:** 2026-04-19

## Überblick

Die Erkennung verarbeitet XML-Spektren vom RadiaCode-101 (CsI(Tl)-Szintillator, 1024 Kanäle) und liefert eine sortierte Liste möglicher Nuklide mit Confidence-Score. Der Algorithmus läuft lokal im Browser, ohne Server-Aufruf.

**Quelle:** [src/common/spectrumParser.ts](../src/common/spectrumParser.ts), Nuklid-Bibliothek in [src/common/strahlenschutz.ts](../src/common/strahlenschutz.ts).

## Pipeline

```
XML-Datei  →  parseSpectrumXml()  →  findPeaks()  →  identifyNuclides()  →  NuclideMatch[]
           Rohdaten +             Peak-Liste     sortiert nach
           Kalibrierung           nach Counts    Confidence
```

### Stage 1: XML-Parsing

**Funktion:** `parseSpectrumXml(xml: string): SpectrumData`

Extrahiert aus dem RadiaCode-XML:

- **Metadaten** — Sample-Name, Gerät, Mess-/Live-Zeit, Start/Ende
- **Kalibrierungs-Koeffizienten** (3 Stück) — Polynom der Form `E(ch) = c₀ + c₁·ch + c₂·ch²`
- **Counts** pro Kanal (1024 Werte)
- **Berechnete Energien** — Energie in keV für jeden Kanal, einmalig via `channelToEnergy(ch, coefficients)`

Das Energie-Array ist die Brücke zwischen Kanal-Index (diskret) und keV-Wert (physikalisch).

### Stage 2: Peak-Finding

**Funktion:** `findPeaks(counts, energies, options?): Peak[]`

Drei aufeinanderfolgende Filter pro Kanal:

#### 2.1 Smoothing (Boxcar-Moving-Average)

```ts
smoothed[i] = mean(counts[i-halfWindow … i+halfWindow])
```

Default `windowSize = 5` → `halfWindow = 2`. Ein 5-Bin-Fenster dämpft einzelne Rausch-Spikes und hebt breitere Strukturen hervor. Alle folgenden Lokal-Max- und Signifikanz-Tests arbeiten auf dem **geglätteten** Signal.

#### 2.2 Lokales Maximum

Kanal `i` gilt als Peak-Kandidat, wenn `smoothed[i]` strikt grösser ist als alle `smoothed[j]` im Fenster `[i-halfWindow, i+halfWindow]`. Strikt (`>`) statt `≥` — sonst würde jedes Plateau (entsteht oft nach Smoothing scharfer Einzelpeaks) komplett akzeptiert.

#### 2.3 Poisson-Signifikanz-Test

γ-Spektren folgen Poisson-Statistik: die Unsicherheit einer Background-Zählrate `B` ist `σ = √B`. Ein Peak gilt als signifikant, wenn

```
smoothed[i]  >  mean + significance · √mean
```

mit:

- `mean` = Mittelwert der Background-Counts in den Kanalbereichen `[i - 3·exclusionRadius, i - exclusionRadius)` und `(i + exclusionRadius, i + 3·exclusionRadius]`
- `exclusionRadius = max(6·halfWindow, 15)` Kanäle um den Peak, um Peak-Flanken nicht mit in den Background-Schätzer zu ziehen
- `significance = 3` (3σ entspricht Currie's Critical Level für Brutto-Counts)

Kanäle unterhalb von `minEnergy` (Default **40 keV**) werden gar nicht erst geprüft — dort dominiert elektronisches Rauschen bei CsI(Tl).

Die akzeptierten Peaks werden absteigend nach `counts` sortiert (der stärkste Peak zuerst).

### Stage 3: Nuklid-Identifikation

**Funktion:** `identifyNuclides(peaks, toleranceKeV?, nuclides?): NuclideMatch[]`

Iteriert über alle bekannten Nuklide (aktuell 19, siehe Nuklid-Bibliothek unten) und vergleicht deren Referenz-Peaks mit den gefundenen.

#### 3.1 FWHM-Modell (Peak-Breite)

CsI(Tl) hat Poisson-limitierte Auflösung: `FWHM(E) ∝ √E`. Kalibriert gegen den RadiaCode-Referenzpunkt von 12 % FWHM bei 662 keV:

```ts
FWHM(E) = 0.12 · √(662 · E)
```

| E (keV) | FWHM (keV) | Auflösung |
| ------- | ---------- | --------- |
| 60      | 23.9       | 40 %      |
| 356     | 58.2       | 16 %      |
| 662     | 79.4       | 12 %      |
| 1173    | 105.7      | 9 %       |
| 1332    | 112.7      | 8 %       |

#### 3.2 Energie-abhängige Match-Toleranz

Ein gefundener Peak matcht einen Referenz-Peak, wenn der Energie-Abstand unter der Toleranz liegt:

```ts
tolerance(E) = max(5 keV, 0.5 · FWHM(E))   // = HWHM mit 5-keV-Floor
```

Warum HWHM? Die halbe FWHM ist die Breite, innerhalb derer ein echter Peak energetisch streut. Mehr wäre zu grosszügig (Rauschen würde gematcht), weniger zu eng (echte Peaks würden knapp verfehlt). Der 5-keV-Floor sichert Niedrigenergie-Matches ab, wo die FWHM-Formel sehr kleine Werte liefert.

Für jeden Referenz-Peak des Nuklids wird der **nächstgelegene** gefundene Peak innerhalb der Toleranz zugeordnet.

#### 3.3 Confidence-Scoring

Der Confidence-Score kombiniert drei Teilbewertungen:

```
confidence = 0.40 · intensityMatched  +  0.45 · avgStrength  +  0.15 · avgAccuracy
```

**`intensityMatched`** — Branching-Ratio-gewichtete Abdeckung der Referenz-Peaks:

```
intensityMatched = Σ intensity(matched) / max(Σ intensity(all), 1.0)
```

- Nuklide mit hoher Gesamt-Emission (≥1 Photon/Decay wie Cs-137, Co-60, Ba-133) werden wie gewohnt gegen ihren Gesamt-Branch normalisiert
- Nuklide mit sehr schwachen Gesamt-Branches (z. B. Ra-226 @ 3.6 %) werden durch den Floor auf 1.0 gedeckelt — so bekommt ein einzelner schwacher Match nicht automatisch den vollen Bonus von 1.0

**`avgStrength`** — Relative Stärke der gematchten Peaks:

```
avgStrength = mean(counts der gematchten Peaks) / counts des stärksten Peaks im Spektrum
```

Ein Nuklid, das die dominanten Peaks erklärt, bekommt eine hohe Stärke. Limitation: bei Mischspektren mit einem sehr dominanten Fremd-Nuklid werden sekundäre Nuklide unter-ranked (siehe § Future Improvements).

**`avgAccuracy`** — Energetische Präzision der Matches:

```
avgAccuracy = 1 - mean(|found.energy - expected| / tolerance)
```

Matches genau auf der Referenz-Energie liefern 1.0; Matches am Rand der Toleranz liefern 0.

Alle Nuklide werden absteigend nach `confidence` sortiert zurückgegeben.

## Wie wird ein Nuklid erkannt? (Detailbeispiel)

Durchgang für ein **Cs-137-Spektrum** mit 661.7 keV-Peak und ein paar Niedrigenergie-Rauschpeaks:

### Schritt 1: Peaks aus dem Spektrum extrahieren

Nach `findPeaks()`:

| Peak | Energy (keV) | Counts | Bedeutung                      |
| ---- | ------------ | ------ | ------------------------------ |
| 1    | 661.7        | 5000   | Photopeak Cs-137               |
| 2    | 195.0        | 180    | Compton/Rückstreu-Artefakt     |
| 3    | 87.5         | 120    | Niedrigenergie-Streuung        |

Der 661.7-keV-Peak ist ein lokales Maximum auf dem geglätteten Signal und liegt signifikant über dem Background (Mittelwert der benachbarten Kanäle × 3σ-Schwelle). Die beiden schwächeren Peaks sind echte lokale Maxima, aber von niedriger Intensität.

### Schritt 2: Gegen die Nuklid-Bibliothek matchen

Für jedes Nuklid der Bibliothek wird geprüft, welche Referenz-Peaks innerhalb der energie-abhängigen Toleranz liegen.

**Cs-137:** Referenz `661.7 @ 0.851`

- Toleranz bei 661.7 keV: `max(5, 0.5·79.4) = 39.7 keV`
- Gefundener Peak 661.7 keV liegt 0 keV entfernt → Match
- `matchedPeaks = [{ expected: 661.7, found: Peak1 }]`

**Ra-226:** Referenz `186.2 @ 0.036`

- Toleranz bei 186.2 keV: `max(5, 0.5·42.1) = 21.1 keV`
- Gefundener Peak 195.0 keV liegt 8.8 keV entfernt → Match
- `matchedPeaks = [{ expected: 186.2, found: Peak2 }]`

**Am-241:** Referenz `59.5 @ 0.359`

- Kein Peak in der Nähe von 59.5 keV → kein Match
- `matchedPeaks = []` → Nuklid wird übersprungen

### Schritt 3: Confidence berechnen

**Cs-137:**

- `totalIntensity = 0.851`
- `matchedIntensity = 0.851`
- `intensityMatched = 0.851 / max(0.851, 1.0) = 0.851`
- `avgStrength = 5000 / 5000 = 1.00`
- `avgAccuracy = 1 - 0/39.7 = 1.00`
- **`confidence = 0.40·0.851 + 0.45·1.00 + 0.15·1.00 = 0.940`**

**Ra-226:**

- `totalIntensity = 0.036`
- `matchedIntensity = 0.036`
- `intensityMatched = 0.036 / max(0.036, 1.0) = 0.036` ← **gedeckelt**, nicht 1.0
- `avgStrength = 180 / 5000 = 0.036`
- `avgAccuracy = 1 - 8.8/21.1 = 0.583`
- **`confidence = 0.40·0.036 + 0.45·0.036 + 0.15·0.583 = 0.118`**

### Schritt 4: Sortierung

Cs-137 (0.940) rankt deutlich vor Ra-226 (0.118) — genau das gewünschte Verhalten. Hätte der `intensityMatched`-Floor nicht gegriffen, wäre Ra-226 auf 0.998 gerutscht und hätte Cs-137 knapp geschlagen.

## Nuklid-Bibliothek

19 Nuklide mit Referenz-Peaks und Branching Ratios aus NNDC NuDat 3 / IAEA LiveChart, gerundet auf 3 signifikante Stellen. Vollständige Liste in [src/common/strahlenschutz.ts](../src/common/strahlenschutz.ts).

Nuklide ohne γ-Peaks (z. B. Sr-90 als reiner β-Strahler) sind in der Bibliothek enthalten, werden aber in der Identifikation übersprungen.

## Known Limitations / Future Improvements

### Mischspektren-Ranking (I3)

**Problem:** `avgStrength` normalisiert gegen den stärksten Peak im **gesamten** Spektrum. In Mischspektren mit einem dominanten Fremd-Nuklid werden sekundäre Nuklide unter-ranked:

- Beispiel: Cs-137 mit 5000 counts + Co-60 mit 300 counts @ 1173 und 320 counts @ 1332
- Co-60 `avgStrength = 310/5000 = 0.062` → confidence ~0.37 (zu niedrig für ein echtes Co-60)

**Richtung für den Fix:** Ein signal-to-background-normalisiertes Scoring `(counts - bg) / √bg` pro Peak würde die absolute Signifikanz jedes Matches bewerten statt relative Stärke im Spektrum. Benötigt Zugriff auf den Background-Schätzer aus `findPeaks`, also eine Signatur-Erweiterung von `Peak` um `background`.

**Blocker:** Test-Fixtures für Mischspektren fehlen (aktuelle `examples/*.xml` sind alle Single-Source). Ohne realistische Testfälle ist das Scoring-Modell nicht validierbar. Feature pausiert, bis solche Spektren verfügbar sind.

### SNIP-Background-Subtraktion

Iterativer Untergrundabzug nach Ryan et al. (1988). Würde den Compton-Kontinuum-Anteil aus dem Signal entfernen und die Peak-Detection bei niedrigen Zählraten stabilisieren. Aktueller Algorithmus kommt bei den Beispiel-Spektren ohne aus — Priorität niedrig.

### Mariscotti-2.-Ableitung

Überlappende Peaks (z. B. Co-57 @ 122.1 und 136.5 keV innerhalb eines einzigen CsI(Tl)-FWHM-Fensters) werden aktuell als ein einziger Peak detektiert. Mariscotti (1967) trennt solche Cluster über die zweite Ableitung. Bei 19 Nukliden und der typischen RadiaCode-Auflösung selten relevant.

### Interferenz-Matrix

Tc-99m und Mo-99 emittieren beide bei 140.5 keV (Tc-99m ist das Tochter-Nuklid). Aktuell matchen beide den gleichen Peak und bekommen unabhängige Confidences. Für quantitative Analyse müsste die Zuordnung über die gesamte Peak-Konstellation disambiguiert werden.

## Referenzen

- **Mariscotti (1967):** *A method for automatic identification of peaks in the presence of background*, NIM 50, 309–320.
- **Currie (1968):** *Limits for qualitative detection and quantitative determination*, Anal. Chem. 40, 586–593.
- **Ryan et al. (1988):** *SNIP, a statistics-sensitive background treatment for the quantitative analysis of PIXE spectra*, NIM B 34, 396–402.
- **RadiaCode-101 User Manual:** 12 % ± 1 % FWHM @ 662 keV.
- **NNDC NuDat 3:** <https://www.nndc.bnl.gov/nudat3/>
