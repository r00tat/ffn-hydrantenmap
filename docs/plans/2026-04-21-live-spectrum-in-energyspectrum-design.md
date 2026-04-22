# Live-Spektrum in EnergySpectrum — Design

**Datum:** 2026-04-21
**Branch:** `feat/radiacode-live-spectrum` (worktree `.worktrees/live-spectrum`)
**Basis:** `feat/radiacode-via-bluetooth`

## Ziel

Das Live-Spektrum des RadiaCode wandert von der Dosimetrie-Seite nach
EnergySpectrum. Dort liegt es als zusätzliche Serie im bestehenden
Overlay-Chart neben den gespeicherten Messungen und ist mit Sichtbarkeits-
Toggle, Reset und Speichern bedienbar. Die Dosimetrie-Seite verliert den
Spektrum-Block komplett.

## Motivation

- Der Spektrum-Overlay-Chart auf EnergySpectrum kann mehrere Spektren
  gleichzeitig zeigen (Peak-Detection, Nuklid-ID, Logarithmus-Toggle).
  Eine Live-Messung profitiert vom direkten visuellen Vergleich mit
  gespeicherten Referenz-Messungen.
- Auf Dosimetrie überlappen sich die absolut-positionierten Buttons
  (Log-Switch, Reset, Speichern) auf Mobile, weil sie über dem
  Spektrum-Chart schweben. Durch die Entfernung des Charts ist das
  Problem strukturell gelöst.
- Dosimetrie konzentriert sich damit auf das, was der Einsatzablauf dort
  wirklich braucht: Dosisleistung, Gesamtdosis, CPS-Trend und
  Geräte-Infos.

## Architektur

`EnergySpectrum.tsx` konsumiert `useRadiacode()` direkt. Solange
`spectrum !== null`, wird aus dem Snapshot ein synthetisches
`LoadedSpectrum` mit `id: 'live'` gebaut und **als erstes Element** in
die `allSpectra`-Liste eingefügt. Damit greifen Chart-Rendering,
`getDisplayRange`, Peak-Detection, Nuklid-Chips und Log-Scale-Toggle
ohne Sonderfälle.

Die bestehenden Firestore-Spektren werden weiterhin über
`useFirebaseCollection` geladen; das Merge-Ergebnis ist
`[live, ...firestore]`.

Farbgebung: Das Live-Item bekommt eine feste eigene Farbe
`#e91e63` (Magenta, bisher in `SERIES_COLORS` ungenutzt). Alle anderen
Spektren behalten ihre Farbe aus dem Zyklus `SERIES_COLORS`, so dass
das Umschalten „live an/aus" die Zuordnung der gespeicherten Spektren
nicht verschiebt.

Die Aktionen **Bearbeiten**, **XML-Download** und **Löschen** sind für
das Live-Item in der Liste unterdrückt. Sichtbarkeits-Toggle bleibt.

## Komponenten

### `EnergySpectrum.tsx` — Erweiterung

Neue Button-Row oberhalb des bestehenden Upload-Blocks:

- **Status-Chip** — aus Dosimetrie übernommen (`statusLabel`,
  `STATUS_CHIP_COLOR`).
- **Verbinden** / **Trennen** — Disabled-Logik wie in Dosimetrie.
- **Reset Live** — ruft `resetLiveSpectrum()`; sichtbar nur wenn
  `spectrum !== null`.
- **Speichern** — öffnet den aus Dosimetrie übernommenen Save-Dialog
  (Name + Beschreibung), ruft `saveLiveSpectrum({ name, description })`.
- **Alert** (Error) — wie in Dosimetrie.

Der bestehende File-Upload-Block und alle Nuklid-/Logarithmus-Controls
bleiben unverändert.

### Live-`LoadedSpectrum`

```ts
{
  id: 'live',
  firestoreId: undefined,
  data: {
    sampleName: 'Live-Aufzeichnung',
    deviceName: device?.name,
    measurementTime: spectrum.durationSec ?? 0,
    liveTime: spectrum.durationSec ?? 0,
    startTime: undefined,
    endTime: undefined,
    coefficients: spectrum.coefficients,
    counts: spectrum.counts,
    energies, // channelToEnergy(ch, coefficients) für ch = 0..counts.length-1
  },
  matches: identifyNuclides(findPeaks(counts, energies)),
  visible: !hiddenIds.has('live'),
  description: 'Live-Daten vom Radiacode',
}
```

### `Dosimetrie.tsx` — Entfernungen

- Block `{spectrumCounts && spectrum && …}` (Live-Spektrum + Controls)
- States: `spectrumLogScale`, `saveOpen`, `saveName`, `saveDescription`,
  `saving`
- Callbacks: `handleOpenSave`, `handleConfirmSave`; Memo
  `spectrumCounts`
- Save-Dialog am Seitenende
- Imports: `RestartAltIcon`, `SaveIcon`, `ZoomableSpectrumChart`,
  `TextField`, `Dialog*`, ggf. `useCallback`, `useSnackbar`, sofern
  sonst nicht mehr gebraucht
- `useRadiacode()`-Destructuring: `spectrum`, `resetLiveSpectrum`,
  `saveLiveSpectrum` entfernen

## Daten-Fluss

```text
RadiacodeProvider
   │
   ├── spectrum (SpectrumSnapshot | null)        ─┐
   ├── resetLiveSpectrum()                        │
   ├── saveLiveSpectrum(meta) → Firestore write   │
   └── status / connect / disconnect              │
                                                  ▼
                                        EnergySpectrum
                                          │
                                          ├── toLiveLoadedSpectrum(spectrum, device)
                                          ├── firestoreLoadedSpectra (useFirebaseCollection)
                                          └── allSpectra = [live?, ...firestore]
                                                 │
                                                 ▼
                                          Chart + Liste (unverändert)
```

Peak-Detection für Live wird bei jedem neuen Snapshot neu berechnet
(`useMemo([spectrum])`). Bei 1024 Kanälen ist das unkritisch.

## Edge Cases

- **Gerät getrennt während Live-Anzeige:** `spectrum` bleibt per
  Provider-Semantik erhalten, solange der Nutzer nicht explizit
  resettet. Das Live-Item zeigt also den letzten Stand, auch wenn
  `status === 'idle'`.
- **Speichern bei leerem Spektrum:** Dialog-Button ist enabled nur,
  wenn `spectrum?.counts` Einträge > 0 enthält, sonst disabled mit
  Tooltip „Kein Live-Spektrum".
- **Sichtbarkeits-Toggle:** `hiddenIds` nutzt `'live'` als Schlüssel;
  nach Geräte-Reconnect-Zyklen bleibt die Sichtbarkeit erhalten, da der
  Key stabil ist.
- **Identifizierung:** Live-Item läuft durch `resolveSpectrumIdentification`;
  `manualNuclide` ist immer `undefined`. Matched-Peak-Referenzlinien
  funktionieren gratis.

## Tests

1. `EnergySpectrum.test.tsx`
   - Ohne `spectrum`: kein Live-Item in der Liste.
   - Mit `spectrum`: Live-Item als erstes Element mit Label
     „Live-Aufzeichnung" und Farbe `#e91e63`.
   - Sichtbarkeits-Toggle schaltet Live-Item in der Serien-Liste des
     Charts.
   - Klick auf „Speichern" + Dialog-Submit ruft `saveLiveSpectrum` mit
     `{ name, description }`.
   - „Reset Live" ruft `resetLiveSpectrum`.
2. `Dosimetrie.test.tsx`
   - Kein `data-testid="spectrum-chart"` mehr im Output.
   - Kein Save-Dialog mehr erreichbar.

Mock-Strategie für `useRadiacode`: Test-spezifischer Provider-Wrapper,
der `spectrum`, `device`, `status`, `resetLiveSpectrum`,
`saveLiveSpectrum` als Props / `vi.fn()` entgegennimmt.

## Nicht-Ziele

- Keine Änderung am `RadiacodeProvider` selbst.
- Kein Umbau der Chart-Engine oder der Peak-Detection.
- Kein geteilter „Aufzeichnung läuft"-Zustand zwischen Dosimetrie und
  EnergySpectrum.
- Kein RadiacodeSettingsDialog auf EnergySpectrum.
