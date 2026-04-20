# Radiacode-BLE-Anbindung — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Live-Erfassung von Dosisleistung+GPS eines Radiacode-Geräts via Bluetooth LE als Marker-Punkte in einer Einsatz-Layer, inkl. automatischer Interpolations-Konfiguration und Umstellung auf Default-Off für Heatmap-/Interpolation-Overlays.

**Architecture:** Plattform-abstrahierter BLE-Hook (Web-Bluetooth + Capacitor-Plugin) → `useRadiacodeDevice`-Hook → Recording-Hook schreibt FirecallItem-Marker bei GPS-Samples mit gewählter Rate. UI-Integration in bestehenden RecordButton via neuen TrackStartDialog. Capacitor-Wrapper lädt via `server.url` die PWA, liefert native BLE + Foreground-Service.

**Tech Stack:** Next.js 16 / React 19 / TypeScript / Vitest / Leaflet / Firebase — plus neu: Capacitor 7, `@capawesome-team/capacitor-bluetooth-low-energy`, `@capacitor/preferences`, `@capacitor/geolocation`.

**Design-Referenz:** [docs/plans/2026-04-20-radiacode-ble-design.md](./2026-04-20-radiacode-ble-design.md)

**Branch:** `feat/radiacode-via-bluetooth` (bereits angelegt).

**Verification nach jeder Phase:** `npm run check` muss grün durchlaufen.

---

## Phase 1 — Types & Pure Logic (keine BLE-Hardware nötig)

### Task 1: Type-Erweiterungen

**Files:**

- Modify: `src/components/firebase/firestore.ts` (FirecallItem + FirecallLayer)
- Create: `src/hooks/radiacode/types.ts`

**Step 1: Typen hinzufügen**

Ergänze in `src/components/firebase/firestore.ts`:

```ts
// In FirecallItem:
accuracy?: number;  // GPS accuracy in meters, at capture time

// In FirecallLayer:
layerType?: 'generic' | 'radiacode';
sampleRate?: 'niedrig' | 'normal' | 'hoch';
```

Neue Datei `src/hooks/radiacode/types.ts`:

```ts
export type SampleRate = 'niedrig' | 'normal' | 'hoch';

export interface SampleRateConfig {
  minDistance: number;  // meters
  minInterval: number;  // seconds
  maxInterval: number;  // seconds
}

export const RATE_CONFIG: Record<SampleRate, SampleRateConfig> = {
  niedrig: { minDistance: 10, minInterval: 1, maxInterval: 30 },
  normal:  { minDistance: 5,  minInterval: 1, maxInterval: 15 },
  hoch:    { minDistance: 2,  minInterval: 1, maxInterval: 5  },
};

export interface RadiacodeMeasurement {
  dosisleistung: number;  // µSv/h
  cps: number;            // counts per second
  timestamp: number;      // epoch ms
}

export interface RadiacodeDeviceRef {
  id: string;
  name: string;
  serial: string;
}
```

**Step 2: tsc check**

Run: `npx tsc --noEmit`
Expected: PASS (kein Consumer kennt die Felder noch).

**Step 3: Commit**

```bash
git add src/components/firebase/firestore.ts src/hooks/radiacode/types.ts
git commit -m "feat(radiacode): type foundations für BLE-Recording"
```

---

### Task 2: TDD `shouldSamplePoint()` Sample-Rate-Gating

**Files:**

- Create: `src/hooks/radiacode/sampling.ts`
- Create: `src/hooks/radiacode/sampling.test.ts`

**Step 1: Failing test schreiben**

`src/hooks/radiacode/sampling.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { shouldSamplePoint } from './sampling';
import { RATE_CONFIG } from './types';

describe('shouldSamplePoint', () => {
  const normal = RATE_CONFIG.normal;

  it('samples when distance exceeds minDistance and interval >= minInterval', () => {
    expect(shouldSamplePoint({
      distanceMeters: 6, secondsSinceLast: 2, config: normal,
    })).toBe(true);
  });

  it('does not sample when distance < minDistance and time < maxInterval', () => {
    expect(shouldSamplePoint({
      distanceMeters: 3, secondsSinceLast: 10, config: normal,
    })).toBe(false);
  });

  it('samples on maxInterval heartbeat even when stationary', () => {
    expect(shouldSamplePoint({
      distanceMeters: 0, secondsSinceLast: 16, config: normal,
    })).toBe(true);
  });

  it('does not sample below minInterval even on big distance', () => {
    expect(shouldSamplePoint({
      distanceMeters: 50, secondsSinceLast: 0.5, config: normal,
    })).toBe(false);
  });
});
```

**Step 2: Run, expect FAIL**

Run: `NO_COLOR=1 npx vitest run src/hooks/radiacode/sampling.test.ts`
Expected: FAIL — module not found.

**Step 3: Minimal-Implementierung**

`src/hooks/radiacode/sampling.ts`:

```ts
import { SampleRateConfig } from './types';

export interface SampleGateInput {
  distanceMeters: number;
  secondsSinceLast: number;
  config: SampleRateConfig;
}

export function shouldSamplePoint({
  distanceMeters, secondsSinceLast, config,
}: SampleGateInput): boolean {
  if (secondsSinceLast < config.minInterval) return false;
  if (secondsSinceLast >= config.maxInterval) return true;
  return distanceMeters >= config.minDistance;
}
```

**Step 4: Run, expect PASS**

Run: `NO_COLOR=1 npx vitest run src/hooks/radiacode/sampling.test.ts`
Expected: 4 tests pass.

**Step 5: Commit**

```bash
git add src/hooks/radiacode/sampling.ts src/hooks/radiacode/sampling.test.ts
git commit -m "feat(radiacode): sample-rate gating logic"
```

---

### Task 3: TDD `createRadiacodeLayer()` Factory

**Files:**

- Create: `src/hooks/radiacode/layerFactory.ts`
- Create: `src/hooks/radiacode/layerFactory.test.ts`

**Step 1: Failing test**

```ts
import { describe, it, expect } from 'vitest';
import { createRadiacodeLayer } from './layerFactory';

describe('createRadiacodeLayer', () => {
  it('creates layer with radiacode type and required fields', () => {
    const layer = createRadiacodeLayer('Messung Einsatz X');
    expect(layer.layerType).toBe('radiacode');
    expect(layer.name).toBe('Messung Einsatz X');
    expect(layer.defaultVisible).toBe('true');
    expect(layer.sampleRate).toBe('normal');
  });

  it('includes dosisleistung, cps, device in dataSchema', () => {
    const layer = createRadiacodeLayer('Test');
    const keys = layer.dataSchema?.map((f) => f.key);
    expect(keys).toEqual(['dosisleistung', 'cps', 'device']);
    expect(layer.dataSchema?.[0]).toMatchObject({
      key: 'dosisleistung', unit: 'µSv/h', type: 'number',
    });
  });

  it('configures heatmap for inverse-square interpolation on dosisleistung, log scale', () => {
    const hm = createRadiacodeLayer('X').heatmapConfig!;
    expect(hm.enabled).toBe(true);
    expect(hm.activeKey).toBe('dosisleistung');
    expect(hm.visualizationMode).toBe('interpolation');
    expect(hm.interpolationAlgorithm).toBe('inv-square');
    expect(hm.colorScale).toBe('log');
  });
});
```

**Step 2: Run, expect FAIL**

Run: `NO_COLOR=1 npx vitest run src/hooks/radiacode/layerFactory.test.ts`

**Step 3: Implementierung**

```ts
import { FirecallLayer } from '../../components/firebase/firestore';

export function createRadiacodeLayer(name: string): FirecallLayer {
  return {
    type: 'layer',
    name,
    layerType: 'radiacode',
    defaultVisible: 'true',
    sampleRate: 'normal',
    dataSchema: [
      { key: 'dosisleistung', label: 'Dosisleistung', unit: 'µSv/h', type: 'number' },
      { key: 'cps',           label: 'Counts/s',      unit: 'cps',   type: 'number' },
      { key: 'device',        label: 'Gerät',         unit: '',      type: 'text'   },
    ],
    heatmapConfig: {
      enabled: true,
      activeKey: 'dosisleistung',
      colorMode: 'auto',
      visualizationMode: 'interpolation',
      interpolationAlgorithm: 'inv-square',
      interpolationRadius: 30,
      interpolationOpacity: 0.6,
      colorScale: 'log',
    },
  };
}
```

**Step 4: Run, expect PASS**

**Step 5: Commit**

```bash
git add src/hooks/radiacode/layerFactory.ts src/hooks/radiacode/layerFactory.test.ts
git commit -m "feat(radiacode): createRadiacodeLayer factory mit Default-DataSchema und Heatmap"
```

---

## Phase 2 — Radiacode-Protokoll (pure TS, fixtures)

**Vorarbeit:** Referenz [cdump/radiacode](https://github.com/cdump/radiacode) — `radiacode/bytes_buffer.py`, `radiacode/transports/bluetooth.py`, `radiacode/decoders/` lesen. Paket-Framing und Real-time-Rate-Event verstehen.

### Task 4: TDD Packet-Framing (Decode)

**Files:**

- Create: `src/hooks/radiacode/radiacodeProtocol.ts`
- Create: `src/hooks/radiacode/radiacodeProtocol.test.ts`
- Create: `src/hooks/radiacode/__fixtures__/` (capture-Datei mit echten BLE-Bytes)

**Step 1: Real-Gerät-Capture erzeugen**

Vor dem Implementieren: einen realen BLE-Capture mit `nRF Connect` oder Python-Testscript machen, der ein Real-time-Rate-Event als rohe Bytes speichert. Datei `__fixtures__/realtime-rate-sample.hex` mit hex-kodierten Bytes einchecken. Optional: wenn der Entwickler kein Radiacode hat, aus Python-Tests der Referenzbibliothek synthetische Pakete erzeugen.

**Step 2: Failing test**

```ts
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseRealtimeRateEvent } from './radiacodeProtocol';

function loadHex(name: string): Uint8Array {
  const hex = readFileSync(join(__dirname, '__fixtures__', name), 'utf8')
    .replace(/\s+/g, '');
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(hex.slice(i*2, i*2+2), 16);
  return bytes;
}

describe('parseRealtimeRateEvent', () => {
  it('decodes dose rate and cps from captured sample', () => {
    const bytes = loadHex('realtime-rate-sample.hex');
    const evt = parseRealtimeRateEvent(bytes);
    expect(evt).toMatchObject({
      dosisleistung: expect.closeTo(0.14, 2),   // expected from capture
      cps: expect.any(Number),
    });
  });
});
```

*(Die Expected-Values werden an den echten Capture angepasst, bevor der Test festgeschrieben wird.)*

**Step 3: Implementation**

Port aus der Python-Referenz:

```ts
// src/hooks/radiacode/radiacodeProtocol.ts
export interface RealtimeRateEvent {
  dosisleistung: number;
  cps: number;
}

export function parseRealtimeRateEvent(bytes: Uint8Array): RealtimeRateEvent {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  // Header-Skip + Feld-Offsets wie in cdump/radiacode bytes_buffer.py + decoders
  // ... (Implementation gemäß Referenz; genaue Offsets im Task zu ermitteln)
  return { dosisleistung: /* ... */ 0, cps: /* ... */ 0 };
}
```

**Step 4: Run, expect PASS**

**Step 5: Commit**

```bash
git add src/hooks/radiacode/radiacodeProtocol.ts src/hooks/radiacode/radiacodeProtocol.test.ts src/hooks/radiacode/__fixtures__/
git commit -m "feat(radiacode): realtime-rate event parser mit Fixture-Test"
```

---

### Task 5: Paket-Framer (Kommando-Send)

Analog zu Task 4, aber für Send-Richtung: `buildRealtimeRateRequest(): Uint8Array`. TDD mit erwartetem Byte-Output aus der Python-Referenz.

Commit: `feat(radiacode): command framer für realtime-rate request`

---

## Phase 3 — BLE-Abstraktion + Device-Preference

### Task 6: `BleAdapter` Interface

**Files:**

- Create: `src/hooks/radiacode/bleAdapter.ts`

Nur Interface + Platform-Dispatch, keine Implementierung:

```ts
import { RadiacodeDeviceRef } from './types';

export type Unsubscribe = () => void;

export interface BleAdapter {
  isSupported(): boolean;
  requestDevice(): Promise<RadiacodeDeviceRef>;
  connect(deviceId: string): Promise<void>;
  disconnect(deviceId: string): Promise<void>;
  onNotification(deviceId: string, handler: (packet: Uint8Array) => void): Promise<Unsubscribe>;
  write(deviceId: string, data: Uint8Array): Promise<void>;
  startForegroundService?(opts: { title: string; body: string }): Promise<void>;
  stopForegroundService?(): Promise<void>;
}

export async function getBleAdapter(): Promise<BleAdapter> {
  // Capacitor-Detection über dynamischen Import, damit Web-Build nicht bricht:
  try {
    const { Capacitor } = await import('@capacitor/core');
    if (Capacitor.isNativePlatform()) {
      return (await import('./bleAdapter.capacitor')).capacitorAdapter;
    }
  } catch {
    // @capacitor/core nicht installiert → Web-Only-Build
  }
  return (await import('./bleAdapter.web')).webAdapter;
}
```

Commit: `feat(radiacode): bleAdapter Interface + Plattform-Dispatch`

---

### Task 7: Web Bluetooth Adapter

**Files:**

- Create: `src/hooks/radiacode/bleAdapter.web.ts`

Nutzt `navigator.bluetooth` — Unit-Tests nur für `isSupported()`-Detection, Rest ist Integration. Service-UUID und Characteristic-UUIDs aus der cdump/radiacode Python-Lib übernehmen.

Commit: `feat(radiacode): web bluetooth adapter`

---

### Task 8: TDD Device Preference Store

**Files:**

- Create: `src/hooks/radiacode/devicePreference.ts`
- Create: `src/hooks/radiacode/devicePreference.test.ts`

Abstrahiert Capacitor `Preferences` und `localStorage` hinter gemeinsamer API. Tests verwenden JSDOM-`localStorage`:

```ts
describe('devicePreference', () => {
  beforeEach(() => localStorage.clear());

  it('returns null when no device saved', async () => {
    expect(await loadDefaultDevice()).toBeNull();
  });

  it('persists and loads device', async () => {
    await saveDefaultDevice({ id: 'abc', name: 'RC-102', serial: 'SN1' });
    expect(await loadDefaultDevice()).toMatchObject({ id: 'abc', serial: 'SN1' });
  });

  it('overwrites existing device on save', async () => {
    await saveDefaultDevice({ id: 'abc', name: 'A', serial: 'SN1' });
    await saveDefaultDevice({ id: 'xyz', name: 'B', serial: 'SN2' });
    expect((await loadDefaultDevice())?.id).toBe('xyz');
  });
});
```

Commit: `feat(radiacode): device preference store (localStorage/Preferences)`

---

### Task 9: `useRadiacodeDevice` Hook

**Files:**

- Create: `src/hooks/radiacode/useRadiacodeDevice.ts`
- Create: `src/hooks/radiacode/useRadiacodeDevice.test.tsx`

Tests mit Mock-Adapter — `renderHook` aus @testing-library/react, manueller `BleAdapter`-Mock, `act()` für Connect/Disconnect. Verifiziert State-Transitionen und Measurement-Extraktion.

Commit: `feat(radiacode): useRadiacodeDevice hook mit connect/scan/measurement state`

---

## Phase 4 — Heatmap-Default global ausschalten

### Task 10: Overlays default-off in LayersControl

**Files:**

- Modify: `src/components/Map/layers/FirecallLayer.tsx:~64-76` + `~137-147`
- Add tests if nicht vorhanden (render-test, dass Overlays default unchecked sind).

**Step 1: Lokalisieren**

```bash
grep -n 'defaultVisible' src/components/Map/layers/FirecallLayer.tsx
```

**Step 2: Änderung**

- `currentNames`-Berechnung: Filter `defaultVisible !== 'false'` entfernen für Heatmap-/Interpolation-Overlays — sie werden nicht mehr im Init-Set aufgenommen.
- Im JSX: `<LayersControl.Overlay checked={false}>` für Heatmap-/Interpolation-Overlays.
- Marker-Layer-Logik bleibt unverändert (folgt weiter `defaultVisible`).

**Step 3: Test**

Schreibe Render-Test in `src/components/Map/layers/FirecallLayer.test.tsx`, der verifiziert dass ein Layer mit `heatmapConfig.enabled=true` einen `checked={false}`-Overlay produziert. Nutze mock-Leaflet wie in bestehenden Map-Tests.

**Step 4: Run checks**

```bash
NO_COLOR=1 npm run test -- src/components/Map/layers/FirecallLayer.test.tsx
```

**Step 5: Commit**

```bash
git add src/components/Map/layers/FirecallLayer.tsx src/components/Map/layers/FirecallLayer.test.tsx
git commit -m "feat(map): heatmap- und interpolation-overlays default off für mobile performance"
```

---

## Phase 5 — UI: TrackStartDialog

### Task 11: TrackStartDialog Grundgerüst + Mode-Radio

**Files:**

- Create: `src/components/Map/TrackStartDialog.tsx`
- Create: `src/components/Map/TrackStartDialog.test.tsx`

MUI-Dialog mit Props:

```ts
interface TrackStartDialogProps {
  open: boolean;
  onClose: () => void;
  onStart: (config: TrackStartConfig) => void;
  existingRadiacodeLayers: FirecallLayer[];
  defaultDevice: RadiacodeDeviceRef | null;
}

interface TrackStartConfig {
  mode: 'gps' | 'radiacode';
  layer: { type: 'existing'; id: string } | { type: 'new'; name: string } | null;
  sampleRate: SampleRate;
  device: RadiacodeDeviceRef | null;
}
```

TDD-Tests:

- Render mit `open=true`, Mode-Radio sichtbar.
- Standardauswahl: `mode='gps'`.
- Bei Mode-Switch zu `radiacode`: Layer-Feld erscheint, Device-Feld erscheint.
- `onStart` wird mit richtiger Config aufgerufen nach Klick auf Starten.

Commit: `feat(map): TrackStartDialog Grundgerüst`

---

### Task 12: Layer-Dropdown + Neuer-Layer-Eingabe

Dropdown zeigt nur Layer mit `layerType === 'radiacode'`. Option "Neuer Layer" schaltet Textfield frei mit Default `Messung ${formatTimestamp(new Date())}`.

Test: Layer-Auswahl ändert das `TrackStartConfig.layer`-Feld korrekt.

Commit: `feat(map): TrackStartDialog Layer-Auswahl`

---

### Task 13: Sample-Rate + Device-Row

Sample-Rate-Radio (Niedrig/Normal/Hoch), Default aus ausgewähltem Layer (wenn existing) oder `'normal'` (wenn neu). Device-Row mit Standardgerät-Anzeige und "Wechseln"-Button.

Test: Wechseln-Button löst `onRequestDevice`-Callback aus.

Commit: `feat(map): TrackStartDialog Sample-Rate und Device-Auswahl`

---

## Phase 6 — Recording-Logik & RecordButton

### Task 14: GPS-Line-Recorder Extraction

**Files:**

- Create: `src/hooks/recording/useGpsLineRecorder.ts` (extrahiert aus RecordButton.tsx)
- Modify: `src/components/Map/RecordButton.tsx`

Bestehende Line-Recording-Logik aus `RecordButton.tsx` 1:1 in einen Hook auslagern. Keine Verhaltensänderung. Bestehende E2E/Manual-Tests verifizieren weiter.

Commit: `refactor(map): gps line recording als wiederverwendbarer hook`

---

### Task 15: Radiacode-Point-Recorder

**Files:**

- Create: `src/hooks/recording/useRadiacodePointRecorder.ts`
- Create: `src/hooks/recording/useRadiacodePointRecorder.test.tsx`

Hook nimmt `{ layerId, sampleRate, measurement$ }` (measurement ist live aus `useRadiacodeDevice`) und schreibt bei jedem qualifizierten GPS-Sample einen `'marker'`-FirecallItem mit `fieldData: { dosisleistung, cps, device }`. Sampling-Gating via `shouldSamplePoint`.

TDD mit Mock-Position + Mock-Measurement: verifiziert Marker-Writes an den richtigen Zeitpunkten.

Commit: `feat(recording): useRadiacodePointRecorder hook`

---

### Task 16: RecordButton Integration

**Files:**

- Modify: `src/components/Map/RecordButton.tsx`

Button öffnet TrackStartDialog beim Klick. Je nach gewähltem Modus wird entweder `useGpsLineRecorder` oder `useRadiacodePointRecorder` gestartet. "Wechseln"-Button in Dialog löst BLE-Scan über Adapter aus. Beim Stopp: Disconnect + Foreground-Service-Ende.

Stelle sicher, dass Runtime-Conditional rendering sauber ist (Hooks dürfen nicht bedingt aufgerufen werden).

Commit: `feat(map): RecordButton mit TrackStartDialog und Radiacode-Mode`

---

### Task 17: RadiacodeLiveWidget

**Files:**

- Create: `src/components/Map/RadiacodeLiveWidget.tsx`
- Create: `src/components/Map/RadiacodeLiveWidget.test.tsx`

Kleines Overlay neben dem RecordButton, zeigt aktuelle Dosisleistung + CPS mit Einheit. Farbcode nach Dosisleistung-Schwellwert (grün < 1 µSv/h, gelb < 10, rot darüber). Verschwindet wenn kein Recording aktiv.

Commit: `feat(map): RadiacodeLiveWidget für Live-Anzeige`

---

## Phase 7 — End-to-End Verification (Web)

### Task 18: Manual smoke test im Browser

**Steps:**

1. `npm run dev`
2. App im Chrome auf Android-Gerät öffnen (via `ngrok` oder lokales LAN mit HTTPS-Cert).
3. In Einsatzkarte: RecordButton klicken, Dialog öffnet.
4. Modus "Strahlenmessung" wählen, "Neuer Layer", Name bestätigen.
5. "Wechseln" klicken → Bluetooth-Picker öffnet → Radiacode wählen.
6. "Starten" klicken → Verbindung wird hergestellt, Live-Widget zeigt Werte.
7. Ein paar Meter laufen → Marker erscheinen auf der Karte.
8. Stopp → Snackbar mit Anzahl.
9. Layer-Sichtbarkeit in LayersControl: Marker sichtbar, Interpolation-Overlay **default aus**.
10. Overlay aktivieren → Interpolation erscheint.

Falls Protokoll-Parsing abweicht: Fixture in `__fixtures__/` aktualisieren, Tests anpassen, neu committen.

---

## Phase 8 — Capacitor-Wrapper

### Task 19: Capacitor-Subprojekt anlegen

**Files:**

- Create: `capacitor/package.json` (eigenes Sub-Projekt, nicht im Root-workspace)
- Create: `capacitor/capacitor.config.ts`
- Create: `capacitor/android/` (via `npx cap add android`)

**Step 1:**

```bash
mkdir capacitor && cd capacitor
npm init -y
npm i @capacitor/core @capacitor/cli @capawesome-team/capacitor-bluetooth-low-energy @capacitor/preferences @capacitor/geolocation
npx cap init "FFN Einsatzkarte" "at.ffn.einsatzkarte" --web-dir=empty
```

**Step 2: `capacitor.config.ts`**

```ts
import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'at.ffn.einsatzkarte',
  appName: 'FFN Einsatzkarte',
  webDir: 'empty',
  server: {
    url: process.env.CAP_SERVER_URL || 'https://einsatz.ffn.at',
    cleartext: false,
  },
};

export default config;
```

**Step 3: `empty/` Stub**

`capacitor/empty/index.html` mit Redirect-Stub, falls server.url nicht geladen wird.

**Step 4: `npx cap add android`**

Erzeugt Gradle-Projekt.

**Step 5: Commit**

```bash
git add capacitor/
git commit -m "feat(capacitor): android-wrapper subproject für radiacode-ble"
```

---

### Task 20: Android-Permissions + Manifest

**Files:**

- Modify: `capacitor/android/app/src/main/AndroidManifest.xml`

Permissions hinzufügen: `BLUETOOTH_CONNECT`, `BLUETOOTH_SCAN`, `ACCESS_FINE_LOCATION`, `FOREGROUND_SERVICE`, `FOREGROUND_SERVICE_LOCATION`, `WAKE_LOCK`.

Foreground-Service-Deklaration für BLE-Plugin.

Commit: `feat(capacitor): android manifest mit ble permissions und foreground service`

---

### Task 21: Capacitor-BLE-Adapter

**Files:**

- Create: `src/hooks/radiacode/bleAdapter.capacitor.ts`

Implementiert das `BleAdapter`-Interface gegen `@capawesome-team/capacitor-bluetooth-low-energy`. `startForegroundService`/`stopForegroundService` delegieren an das Plugin.

Unit-Test optional (mockt das Plugin-Modul); Haupt-Verifikation ist der APK-Build + manueller Test.

Commit: `feat(radiacode): capacitor BLE adapter`

---

### Task 22: Foreground-Service-Wiring im Recorder

**Files:**

- Modify: `src/hooks/recording/useRadiacodePointRecorder.ts`

Beim Start: `adapter.startForegroundService?.({ title: 'Strahlenmessung läuft', body: name })`. Beim Stop: `stopForegroundService?.()`. Web-Adapter implementiert die Methode nicht (optional-Chaining greift).

Test: Mock-Adapter verifiziert Aufruf von `startForegroundService` bei Recording-Start.

Commit: `feat(recording): foreground service während radiacode-recording`

---

### Task 23: APK-Build + Sideload

**Files:**

- Create: `capacitor/build.sh` (lokales Build-Script)
- Modify: `.github/workflows/` (optional: CI-Build-Job)

**Steps:**

```bash
cd capacitor
CAP_SERVER_URL=https://einsatz.ffn.at npx cap sync android
cd android
./gradlew assembleRelease
# oder assembleDebug für Tests
```

APK signieren, sideload via `adb install`, auf Testgerät ausführen.

Test-Checkliste:

- App startet, zeigt PWA.
- BLE-Permissions werden nach OS-Guideline abgefragt.
- Recording-Start triggert Foreground-Service-Notification.
- Screen sperren → Werte werden weiter geschrieben (über `adb logcat | grep '\[TRACK\]'` verifizierbar).
- Screen entsperren → Live-Widget zeigt aktuelle Werte.
- Recording-Stop beendet Notification.

Commit: `build(capacitor): signierter android-build für sideload`

---

## Phase 9 — Final Verification

### Task 24: `npm run check`

```bash
NO_COLOR=1 npm run check
```

Alles grün: tsc, eslint, vitest, next build.

### Task 25: Manueller E2E-Durchlauf am Einsatzgerät

Wie Task 18, aber auf dem finalen APK. Dokumentiere Befunde in Test-Plan des PR.

### Task 26: PR erstellen

Titel: `feat(radiacode): live-BLE-anbindung mit marker-layer und capacitor-wrapper`

Beschreibung auf Deutsch gemäß Repo-Konvention mit Zusammenfassung, Änderungen und Test-Plan.

Commit-History sollte durch die kleinteiligen Commits oben bereits clean sein — kein Squash nötig.

---

## Offene Risiken beim Ausführen

- **Radiacode-Protokoll:** Ohne echtes Gerät nicht vollständig verifizierbar. Tasks 4/5 brauchen einen Capture, sonst ist Phase 2 blockiert. Falls kein Gerät → Python-Referenz lokal starten, BLE-Bytes dumpen.
- **Android-Hersteller-Quirks:** Foreground-Service-Stabilität auf Xiaomi/Oppo etc. ggf. abweichend. Im Test-Plan explizit notieren, welches Gerät verwendet wurde.
- **Web-Bluetooth-Re-Pairing:** Nach jedem Tab-Close muss der User im Web das Gerät erneut autorisieren. Akzeptiert für Phase 7; Capacitor-Build (Task 21 ff.) behebt das.
