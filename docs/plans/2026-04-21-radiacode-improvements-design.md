# RadiaCode Feature- und Bugfix-Paket

**Datum:** 2026-04-21
**Branch:** `feat/radiacode-via-bluetooth`
**Status:** Design freigegeben, Implementierung steht aus

## Zusammenfassung

Sechs Verbesserungen am RadiaCode-Teil der App, parallel in vier Worktrees
umgesetzt und am Ende in `feat/radiacode-via-bluetooth` gemerged:

1. Gesamtdosis: falscher Konversionsfaktor (1000× zu groß).
2. Spektrum-Export als RadiaCode-XML (für Re-Import in die Original-App).
3. Live-Anzeige als Teil der Dosimetrie-Seite (kumulatives Live-Spektrum
   + CPS-Trend), nicht mehr als separates Modal.
4. Pan/Zoom im Spektrum-Chart.
5. Hover/Touch-Crosshair auf dem Spektrum zeigt Nuklide an der Cursor-Energie.
6. Pull-to-Refresh auf Android führt einen vollen Seiten-Reload aus.

## 1. Gesamtdosis: Konversionsfaktor-Bug

**Problem.** [src/hooks/radiacode/client.ts:23,359](../../src/hooks/radiacode/client.ts#L23-L359)
rechnet `rareValid.dose * 1e6` (Sv → µSv). Tatsächlich liefert das Gerät
den Dose-Rohwert in einer anderen Einheit — der angezeigte Wert ist 1000×
zu groß. Die Protokoll-Doku
[docs/radiacode-bluetooth-protocol.md:293,302](../radiacode-bluetooth-protocol.md#L293-L302)
behauptet irreführend „µSv aus RareData".

**Fix.**

- Konstante `DOSE_SV_TO_USV = 1e6` → `DOSE_RAW_TO_USV = 1e3` (Rohwert in
  mSv, Skalierung auf µSv).
- Kommentar/Einheit in `docs/radiacode-bluetooth-protocol.md` korrigieren.
- Test in [src/hooks/radiacode/client.test.ts](../../src/hooks/radiacode/client.test.ts)
  mit gleichem Faktor aktualisieren.

**Verifikation vor Commit.** Der Agent muss den Dose-Wert der App mit der
Anzeige am echten RadiaCode-Gerät vergleichen und die Übereinstimmung
dokumentieren. Weicht der korrigierte Faktor ab, den tatsächlichen Faktor
empirisch ableiten (z. B. nSv ⇒ ×1e-3? die User-Aussage „nSv" war unscharf,
„1000× zu groß" ist der harte Datenpunkt).

## 2. Spektrum-XML-Export

**Ziel.** Gespeicherte Spektren lassen sich einzeln als `.xml` herunterladen,
im exakt gleichen Schema wie ein RadiaCode-Export. Ein so exportiertes File
muss in der RadiaCode-App wieder importierbar sein und durch unseren eigenen
Parser [src/common/spectrumParser.ts:66](../../src/common/spectrumParser.ts#L66)
bit-identisch zurückgelesen werden können.

**Struktur.**

- Neues Modul `src/common/spectrumExporter.ts` mit
  `exportSpectrumXml(spectrum: Spectrum): string`.
- Schema invers zu `parseSpectrumXml`:
  `ResultDataFile > ResultData > { DeviceConfigReference/Name, SampleInfo/Name,
  StartTime, EndTime, EnergySpectrum > { NumberOfChannels, MeasurementTime,
  LiveTime, EnergyCalibration/Coefficients/Coefficient[], Spectrum/DataPoint[] } }`.
- Download-Button in [src/components/pages/EnergySpectrum.tsx](../../src/components/pages/EnergySpectrum.tsx)
  pro ausgewähltem Spektrum.
- Dateiname: `Spectrum_<sanitizedSampleName>_<YYYY-MM-DD>.xml`.

**Tests.**

- `spectrumExporter.test.ts`: Roundtrip `parseSpectrumXml(exportSpectrumXml(s))`
  liefert dieselben Felder zurück.
- Validität: Output ist well-formed XML, wird ohne Fehler vom bestehenden
  Parser konsumiert.

## 3. Live-Anzeige als normale Messung

**Ziel.** Die Live-Anzeige sieht aus wie eine gespeicherte Messung. Kein
separater Dialog; stattdessen zeigt die Dosimetrie-Seite permanent ein
kumulatives Live-Spektrum, solange das Gerät verbunden ist. „Speichern"
schreibt den aktuellen Stand als neues Firestore-Spektrum.

**Datenfluss.**

- [src/components/providers/RadiacodeProvider.tsx](../../src/components/providers/RadiacodeProvider.tsx)
  startet Spektrum-Polling automatisch beim Connect (nicht erst beim
  „Aufnehmen"), akkumuliert in-Memory (`spectrumRef`, Baseline-Logik bleibt).
- Neuer Ring-Buffer `cpsHistory: { t: number; cps: number }[]` (300 Samples,
  1 Hz, 5 min rollierend), befüllt aus dem bereits laufenden `startPolling`.
- Aktionen in der Dosimetrie-UI:
  - **Reset** — setzt Baseline neu, leert `cpsHistory`, beginnt Akkumulation
    erneut.
  - **Speichern** — identisch zu `handleStopAndSave()` heute in
    [RadiacodeCaptureDialog.tsx:136](../../src/components/pages/RadiacodeCaptureDialog.tsx#L136):
    erstellt `Spectrum`-Item, persistiert via `addItem`. Danach läuft Live
    weiter.
  - **Verwerfen** — entfällt, da Live permanent; nur Reset.

**UI.**

- [src/components/pages/Dosimetrie.tsx](../../src/components/pages/Dosimetrie.tsx)
  bekommt unterhalb der Metric-Tiles einen `SpectrumChart` (die gleiche
  Komponente wie für gespeicherte Spektren) und darunter einen kleineren
  `CpsTrendChart`.
- `RadiacodeCaptureDialog` wird entfernt; die Aktionen (Reset/Speichern) sind
  Buttons neben dem Live-Chart.
- Y-Achse default **log-skaliert**, volle verfügbare Höhe, Farbgebung analog
  zur RadiaCode-App.

**Tests.**

- Provider-Test: CPS-History wird korrekt gefüllt, rolliert nach 300 Samples
  den ältesten Eintrag raus, Reset leert sie.
- Integration: „Speichern" erzeugt Firestore-Item mit den aktuellen Counts
  und Koeffizienten.

## 4. Spektrum-Zoom

**Ziel.** Pan/Zoom auf dem Spektrum-Chart, für Live wie Gespeichert.

**Struktur.**

- Neue Komponente `ZoomableSpectrumChart` (wrapper um MUI
  `LineChart`) in [src/components/pages/](../../src/components/pages/).
- State `xRange: [minKeV, maxKeV]` und `yRange: [minCounts, maxCounts]`
  werden an `xAxis.min/max` / `yAxis.min/max` des `LineChart` weitergegeben.
- Handler:
  - `wheel` → Zoom X um Cursor-Position; `shift+wheel` → Zoom Y.
  - `pointerdown + pointermove` (einzelner Zeiger, Maus-Drag) → Pan X.
  - Touch 2-Finger-Pinch → Zoom X; 1-Finger-Drag → Pan X (über
    `pointer`-Events mit `pointerType === 'touch'` oder dedizierte
    `touchstart/touchmove`-Handler mit zwei Touches).
  - Double-click / double-tap → Reset auf vollen Bereich.
- Y-Achse default auto-fit auf sichtbaren X-Bereich (max Count im Fenster),
  solange User nicht manuell Y zoomt.

**Tests.**

- Reine State-Logik (ohne DOM): Wheel-Event in der Mitte halbiert/verdoppelt
  `xRange`, Pan verschiebt beide Grenzen um Delta, Reset stellt
  `[0, maxEnergy]` wieder her.

## 5. Nuklid-Hover mit Crosshair

**Ziel.** Fährt man mit Maus oder Finger über das Spektrum, wird die aktuelle
Energie angezeigt plus alle Nuklide, deren Peaks in Toleranz liegen. Die
Peaks des Top-Match-Nuklids werden während des Hovers als vertikale
Reference-Lines eingeblendet.

**Struktur.**

- State `hoverEnergy: number | null` in `ZoomableSpectrumChart` (oder einer
  darin eingebetteten Overlay-Komponente).
- Pointer-/Touch-Handler auf Chart-Fläche; x-Pixel → keV über die aktuelle
  X-Skala (abgeleitet aus `xRange` und Layout-Breite).
- Nuklid-Lookup pro Frame:
  `NUCLIDES.filter(n => n.peaks?.some(p => Math.abs(p.energy - hoverEnergy) <= toleranceFor(hoverEnergy)))`.
- Tooltip (positioniert am Cursor): `<energy> keV` + Top-3 Matches nach
  „Abstand × Intensität".
- Reference-Lines: alle Peaks des besten Matches via bestehendem
  [src/common/nuclidePeakLines.ts:16](../../src/common/nuclidePeakLines.ts#L16).
- `pointerleave` / `pointercancel` / `touchend` → `hoverEnergy = null`.

**Tests.**

- Energie-Mapping (Pixel→keV) für gegebene `xRange`/Breite.
- Nuklid-Filter: bekannter Cs-137-Peak bei 662 keV matcht, wenn Cursor bei
  660 keV; matcht nicht bei 800 keV.

## 6. Pull-to-Refresh (Android)

**Ziel.** Auf Android-Capacitor zieht der Nutzer die Seite nach unten, ein
Spinner erscheint, nach Loslassen führt `window.location.reload()` einen
vollständigen Seiten-Reload aus.

**Struktur.**

- Hook `usePullToRefresh(onRefresh: () => void)` in
  [src/hooks/](../../src/hooks/).
  Bindet `touchstart/touchmove/touchend` auf `document`, erkennt Overscroll
  bei `scrollTop === 0`, zeigt einen Spinner (MUI `CircularProgress`) sobald
  die Zieh-Schwelle erreicht wird.
- Aktivierung nur wenn `Capacitor.getPlatform() === 'android'`; Web-Browser
  haben eigene PtR und würden doppelt triggern.
- Integration im App-Shell
  ([src/app/layout.tsx](../../src/app/layout.tsx) oder einer bereits
  existierenden Shell-Komponente).

**Tests.**

- Hook-Unit-Test mit simulierten Touch-Events: Pull-Distance > Schwelle ⇒
  `onRefresh` wird einmalig gerufen, Distanz < Schwelle ⇒ keine Reaktion.

## Worktree- und Merge-Strategie

Vier parallele Worktrees unter `.worktrees/` (Konvention aus
[CLAUDE.md](../../CLAUDE.md)):

| Worktree                     | Scope              | Basis-Branch                    |
| ---------------------------- | ------------------ | ------------------------------- |
| `.worktrees/radiacode-dose-fix`      | #1                 | `feat/radiacode-via-bluetooth`  |
| `.worktrees/radiacode-xml-export`    | #2                 | `feat/radiacode-via-bluetooth`  |
| `.worktrees/radiacode-spectrum-ux`   | #3 + #4 + #5       | `feat/radiacode-via-bluetooth`  |
| `.worktrees/radiacode-pull-refresh`  | #6                 | `feat/radiacode-via-bluetooth`  |

**Begründung #3+#4+#5 gemeinsam:** Alle drei modifizieren denselben
`SpectrumChart`/`ZoomableSpectrumChart`-Komplex; ein Split würde drei
aufeinander wartende Rebases erzeugen.

**Merge-Reihenfolge** (klein zuerst, damit der große Spectrum-UX-Branch am
Ende rebased):

1. `radiacode-dose-fix`
2. `radiacode-xml-export`
3. `radiacode-pull-refresh`
4. `radiacode-spectrum-ux`

**Pro Worktree vor Merge:**

- `.env.local` in Worktree kopieren
  (`cp .env.local .worktrees/<name>/`).
- `npm run check` muss grün sein (tsc, lint, tests, build).
- TypeScript-Fehler dürfen **nicht** ignoriert werden, auch nicht
  „vorbestehende".
- Commits folgen Conventional Commits.

## Offene Punkte für Implementierung

- Dose-Faktor: vor Merge von `#1` am Gerät gegenprüfen und Faktor im
  Commit-Message dokumentieren.
- Referenz-XML einer RadiaCode-Originaldatei besorgen (ein Sample genügt),
  um `#2` End-to-End zu validieren.
- CPS-Historie in `#3`: prüfen, ob bestehender `startPolling` 1 Hz liefert
  oder ob eine eigene Zeitquelle nötig ist.
