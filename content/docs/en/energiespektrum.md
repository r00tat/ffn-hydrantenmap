# Energy spectrum

The energy spectrum page analyses gamma spectra from a **RadiaCode-101** scintillator (CsI(Tl), 1024 channels) and automatically identifies the contained nuclides. The entire evaluation runs locally in the browser – no measurement data is sent to a server.

:::info
You can reach the page via **Hazmat → Energy spectrum** or directly via the **Energy spectrum** menu item in the active operation. Stored measurements are part of the operation and visible to all authorised users.
:::

## Features

- **Upload spectra** Multiple files at once (XML, rcspg, zrcspg, JSON, CSV) from the official RadiaCode app or the RadiaCode export
- **Automatic nuclide detection** Peak finding with 3σ significance plus matching against a library of 19 nuclides with branching ratios from NNDC / IAEA
- **Manual nuclide assignment** Override the automatic result when you already know the sample (e.g. from context)
- **Overlay multiple spectra** Compare sample, background and reference in the same chart – linear or logarithmic Y-axis
- **Show reference peaks** Mark any nuclides from the library with their theoretical peak energies as lines in the chart
- **Direct links to nuclide databases** Per identified nuclide quick access to NNDC NuDat 3, IAEA LiveChart and the RadiaCode spectrum library
- **Stored within the operation** Uploaded spectra are saved as operation items and appear as events in the operation log

## Instructions

### 1. Upload a spectrum

1. Export the measurement as a file in the RadiaCode app (XML, rcspg, zrcspg, JSON or CSV)
2. In the operations map open **Energy spectrum** and click **Upload file(s)**
3. Select one or more spectrum files
4. The spectra are analysed immediately; the nuclide with the highest confidence appears as a green chip after the sample name

:::info
Tip: In addition to the sample, also upload a **background spectrum** (RadiaCode measurement without the sample, same measurement time). This lets you tell which peaks really come from the sample and which from natural background (K-40 at 1461 keV, Ra-226 / Th-232 decay chains).
:::

### 2. Read the identification result

Each loaded spectrum is listed together with the detected nuclide:

- **Green chip** – automatically detected nuclide with confidence in percent (e.g. *Cs-137 (94%)*)
- **Blue chip** – manually assigned nuclide; overrides the automatic result
- **Yellow chip "Not identified"** – no reference peak could be matched within the tolerance
- **Click the chip** – if further candidates exist they expand; clicking a candidate displays its peak lines in the chart
- **RadiaCode / IAEA / NNDC** – direct links to the reference databases for the identified nuclide

### 3. Edit a measurement or assign manually

1. Click the **pencil icon** of the measurement in the list
2. Enter title / sample name, description or a manually assigned nuclide
3. **Save** – the assignment overrides the auto-detection in the list and in the operation log; the original auto-detection remains visible as a grey hint chip

### 4. Use the chart

- **Eye icon** – show or hide individual spectra; the chart updates automatically
- **Logarithmic** – switch to a logarithmic Y-axis to make weak peaks visible next to strong ones
- **Show peaks of nuclides** – dropdown with all library nuclides; selected reference peaks are drawn as coloured dashed lines
- **Red lines** – peaks of the actually identified (or manually assigned) nuclide of the visible spectra

:::warning
Note: The detection does not replace a qualified radiation protection analysis. For real operations or suspected contamination involve the official authorities (e.g. the regional radiation protection department, AGES). The app provides preliminary orientation.
:::

## How does detection work?

The analysis runs in three stages. The input XML is produced by the RadiaCode spectrometer and contains 1024 channels (counts) per measurement plus calibration coefficients that map each channel to an energy in keV.

### Stage 1 – XML parsing and calibration

Metadata (sample name, device, measurement / live time, start/end), the three calibration coefficients (c₀, c₁, c₂) and the 1024 channel counts are extracted from the file. From these the energy of each channel is computed once:

```
E(ch) = c₀ + c₁·ch + c₂·ch²
```

### Stage 2 – Peak finding

The spectrum is smoothed with a 5-bin moving average. A channel counts as a peak candidate if it is a strict local maximum in the smoothed signal. A Poisson significance test is then applied:

```
smoothed[i] > mean + 3·√mean
```

`mean` is the background in neighbouring channels (with an exclusion zone around the peak so that the peak flanks do not distort the background). The 3σ threshold corresponds to Currie's *critical level* for gross counts. Channels below 40 keV are ignored – there electronic noise of the CsI(Tl) scintillator dominates.

### Stage 3 – Nuclide identification

For every library nuclide the reference peaks are compared with the found peaks. The match tolerance is energy dependent (half-width at half maximum of the detector, HWHM):

```
FWHM(E) = 0.12 · √(662 · E)   // RadiaCode-101: 12 % at 662 keV
tolerance(E) = max(5 keV, 0.5 · FWHM(E))
```

Each reference peak is assigned to the nearest found peak within this tolerance. From the matches a confidence value is computed combining three aspects:

```
confidence = 0.40·intensityMatched + 0.45·avgStrength + 0.15·avgAccuracy
```

- **intensityMatched (40 %)** Branching-ratio weighted coverage of the reference peaks – capped at 1.0 so weak nuclides like Ra-226 (3.6 % total emission) do not automatically get the full bonus
- **avgStrength (45 %)** Average counts of the matched peaks relative to the strongest peak in the spectrum – measures how dominant the nuclide is
- **avgAccuracy (15 %)** How precisely the found peaks line up energetically with the reference energies – 1.0 for a perfect match, 0 at the edge of the tolerance

## Known limitations

- **Mixed spectra** Dominant nuclides push the confidence of secondary nuclides down. Two weak sources are detected reliably; a weak one next to a strong one may not be.
- **Overlapping peaks** Closely spaced peaks within one FWHM window (e.g. Co-57 at 122.1 and 136.5 keV) are resolved by the detector as a single peak.
- **Interferences** Nuclides with identical peak energies (e.g. Tc-99m and Mo-99 at 140.5 keV) cannot be unambiguously distinguished from a single spectrum.
- **Low-energy range** Below 40 keV nothing is searched for due to electronic noise. Am-241 (59.5 keV) and I-125 (35.5 keV) are therefore only partly or not at all detectable.

## References

- **[RadiaCode spectrum library](https://www.radiacode.com/spectrum-isotopes-library)** Reference spectra of individual nuclides, recorded with the RadiaCode-101
- **[NNDC NuDat 3](https://www.nndc.bnl.gov/nudat3/)** Nuclear Data Center – peak energies and branching ratios
- **[IAEA LiveChart of Nuclides](https://www-nds.iaea.org/relnsd/vcharthtml/VChartHTML.html)** Interactive nuclide chart with decay data
