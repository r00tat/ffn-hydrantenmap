# Dosimetrie-Seite — Design

**Branch:** `feat/radiacode-dosimetrie` (Worktree: `.worktrees/feat-radiacode-dosimetrie/`)
**Basis:** `feat/radiacode-via-bluetooth` — setzt auf den bestehenden Radiacode-BLE-Stack (Protokoll, Client, `useRadiacodeDevice`, Capacitor-Wrapper) auf.

## Ziel

Eigene Seite unter `Schadstoff › Dosimetrie` (Route `/schadstoff/dosimetrie`), die die Radiacode-BLE-Verbindung unabhängig vom Kartenlayer verwaltet und live Dosisleistung, kumulierte Dosis sowie Zählrate anzeigt — inklusive 5-min-Live-Chart für die Dosisleistung.

## Anforderungen (vom User)

1. Verbindung zum Radiacode herstellen, trennen, auf anderes Gerät wechseln.
2. Aktuelle Dosisleistung in µSv/h (bzw. mSv/h bei ≥ 1000 µSv/h) und CPS.
3. Bisher aufgenommene Gesamtdosis (Gerät, aus RareRecord).
4. Live-Chart Dosisleistung letzte 5 min, rollierend.
5. Buffer + Verbindung bleiben bei Seitenwechsel/Disconnect erhalten (global).
6. Y-Achse Log/Linear umschaltbar.
7. Keine persistente Speicherung der Dosisleistung nötig.

## Architektur

### RadiacodeProvider (global)

Einzelne BLE-Verbindung, wrappt `useRadiacodeDevice` und stellt zusätzlich den rollierenden 5-min-Verlauf bereit. Im App-Root eingehängt, oberhalb der `/schadstoff/*`- **und** der Karten-Routes. Alle bisherigen Konsumenten (`RecordButton`, `useRadiacodePointRecorder`, `RadiacodeLiveWidget`) werden auf `useRadiacode()` umgestellt — verhindert parallele BLE-Verbindungen, weil das Gerät exklusiv koppelt.

```ts
interface RadiacodeContextValue {
  status: RadiacodeStatus;
  device: RadiacodeDeviceRef | null;
  measurement: RadiacodeMeasurement | null; // erweitert um dose, temp, charge
  history: RadiacodeSample[];                // rolling 5 min
  error: string | null;
  connect: () => Promise<void>;              // scan + connect in einem
  disconnect: () => Promise<void>;
}

interface RadiacodeSample {
  t: number;              // epoch ms
  dosisleistung: number;  // µSv/h
  cps: number;
}
```

### Protokoll-Erweiterung (RareRecord → Dosis)

`protocol.ts:decodeDataBufRecords` dekodiert `RareRecord` bereits (eid=0, gid=3) mit `dose` (float32, Sv), `duration`, `temperatureC`, `chargePct`. In `client.ts:extractLatestMeasurement` wird aktuell nur `realtime` extrahiert. Erweiterung: zusätzlich den jeweils letzten `rare`-Record übernehmen und in `RadiacodeMeasurement` ablegen (dose × 1e6 → µSv).

```ts
// types.ts
export interface RadiacodeMeasurement {
  dosisleistung: number;  // µSv/h
  cps: number;
  timestamp: number;
  dose?: number;          // µSv, Geräte-Akkumulator (optional — nicht jeder Poll liefert RareRecord)
  temperatureC?: number;
  chargePct?: number;
}
```

Optional, damit bestehende Tests / Consumer nicht brechen.

### History-Logik (pure)

```ts
// src/hooks/radiacode/history.ts
export function pushAndPrune(
  samples: RadiacodeSample[],
  next: RadiacodeSample,
  now: number,
  windowMs = 5 * 60_000,
): RadiacodeSample[];
```

TDD-Tests:
- Sample wird angehängt.
- Ältere Einträge < `now - windowMs` werden entfernt.
- Leerer Input + neues Sample → 1-Element-Array.
- Sample mit zukünftigem `t` trotzdem behalten (Clock-Skew).

### Formatierung

```ts
// src/common/doseFormat.ts
export function formatDoseRate(microSvPerHour: number): { value: string; unit: 'µSv/h' | 'mSv/h' };
export function formatDose(microSv: number): { value: string; unit: 'µSv' | 'mSv' };
export function doseRateLevel(microSvPerHour: number): 'normal' | 'elevated' | 'high' | 'critical';
```

Schwellen:
- `< 1 µSv/h` → normal (grün)
- `< 10` → elevated (gelb)
- `< 100` → high (orange)
- `≥ 100` → critical (rot)

Skalierung: ≥ 1000 µSv (bzw. µSv/h) → mSv-Einheit, 2 Nachkommastellen.

## UI — Dosimetrie.tsx

Vertikal gestapelt, mobile-first, innerhalb des bestehenden `SchadstoffLayout` (Box mit padding).

1. **Verbindungsleiste**
   - Status-Chip: `Getrennt` / `Verbindet …` / `Verbunden — ${device.name} (${serial})` / `Fehler`
   - Button `Verbinden` (öffnet BLE-Picker via `connect()`)
   - Button `Trennen` (disabled wenn nicht `status==='connected'`)
   - Bei Fehler: MUI `Alert severity="error"`

2. **Messwert-Kacheln** (MUI Grid, 3 Spalten ≥md, sonst 1-spaltig)
   - **Dosisleistung** — große Zahl + Einheit, Ampelfarbe aus `doseRateLevel()`
   - **Gesamtdosis** — aus `measurement.dose`, auto-skaliert. Falls `dose===undefined`: Placeholder `—`.
   - **Zählrate** — `cps` als Ganzzahl

3. **Live-Chart** (MUI X `LineChart`)
   - X-Achse: relativ `-5 min … jetzt`
   - Y-Achse: Dosisleistung in µSv/h, **Log/Linear-Toggle** via `Switch` rechts oben am Chart-Container
   - Serie: einzelne Linie; Farbe abgeleitet aus `doseRateLevel()` des letzten Wertes
   - Leerer Zustand: `<Typography>Keine Messdaten — Gerät verbinden</Typography>`
   - Log-Scale: Werte < 0.01 auf 0.01 klemmen, damit `log(0)` nicht explodiert

## Dateien

### Neu

- `src/app/schadstoff/dosimetrie/page.tsx` — Route-Wrapper (dynamic import, ssr:false)
- `src/components/pages/Dosimetrie.tsx` — Hauptkomponente
- `src/components/providers/RadiacodeProvider.tsx` + Test
- `src/hooks/radiacode/history.ts` + Test
- `src/common/doseFormat.ts` + Test

### Geändert

- `src/hooks/radiacode/types.ts` — `dose`, `temperatureC`, `chargePct` (optional) in `RadiacodeMeasurement`
- `src/hooks/radiacode/client.ts` — `extractLatestMeasurement` liest RareRecord
- `src/hooks/radiacode/client.test.ts` — Test mit RareRecord-Fixture
- `src/hooks/radiacode/__fixtures__/` — neue Fixture `databuf_rsp_with_rare.hex` (aus echtem Capture oder aus vorhandenem Material synthetisiert)
- App-Root-Layout (`src/app/layout.tsx` oder `ClientProviders`) — `RadiacodeProvider` einhängen
- `src/components/Map/RecordButton.tsx` — nutzt `useRadiacode()` statt lokalem Hook
- `src/hooks/recording/useRadiacodePointRecorder.ts` — nutzt Context
- `src/components/Map/RadiacodeLiveWidget.tsx` — nutzt Context
- `src/components/site/AppDrawer.tsx` — Menüeintrag `Dosimetrie` unter Schadstoff

## Testing (TDD)

1. `pushAndPrune` — Anhängen, Prunen, Leer-Input.
2. `formatDoseRate` / `formatDose` / `doseRateLevel` — Schwellen, Einheitenumschaltung, Nachkommastellen.
3. `extractLatestMeasurement` — RareRecord-Fixture liefert `dose` korrekt, altes Fixture liefert `dose===undefined`.
4. `RadiacodeProvider` — Render mit Mock-Adapter: Buffer füllt sich, `pushAndPrune` wird bei Measurement-Updates aufgerufen.
5. `Dosimetrie.tsx` — Render mit gemocktem Context:
   - Ohne Verbindung: Connect-Button sichtbar, Messwerte `—`.
   - Mit Verbindung: Werte + Chart-Platzhalter sichtbar.
   - Log/Linear-Toggle klickbar, ändert Prop am Chart (via `data-testid` oder LineChart-Mock).

## Risiken / Offene Punkte

- **Refactor-Scope**: Umstellen von RecordButton, useRadiacodePointRecorder, RadiacodeLiveWidget auf den Context. Lokales Verhalten identisch; nur die Verbindungs-Owner-Rolle wandert in den Provider.
- **Dosis-Reset-Verhalten**: Radiacode-`dose` ist seit letztem Geräte-Reset akkumuliert. Beim Gerätewechsel springt der Wert — akzeptabel, weil das Chart nur Dosisleistung zeigt.
- **Log-Scale bei 0**: Werte auf `max(x, 0.01)` klemmen für Log-Darstellung.
- **Fixture-Erzeugung**: Wenn kein neuer BLE-Capture mit RareRecord vorliegt, synthetisieren wir ein minimales DATA_BUF mit einem `realtime` + einem `rare`-Record anhand der dokumentierten Offsets.

## Nicht im Scope

- Persistente Speicherung der Dosisleistung-Historie (explizit vom User ausgeschlossen).
- Export / Download des 5-min-Verlaufs.
- Temperatur- / Batterie-Anzeige im UI (RareRecord liefert sie mit, wir parsen sie, zeigen sie aber erst in einer Folge-Iteration).
- Integration der Messungen in eine Einsatz-Layer (das macht der bestehende RecordButton).
