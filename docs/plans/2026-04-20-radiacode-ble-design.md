# Radiacode-BLE-Anbindung: Live-Messpunkte in der Einsatzkarte

**Datum:** 2026-04-20
**Scope:** Live-Erfassung von Dosisleistung + CPS eines Radiacode-Geräts via Bluetooth LE, Speicherung als Marker-Punkte in einer Layer-Ebene inkl. automatischer Heatmap-/Interpolations-Konfiguration. Android-only; Web als Foreground-Fallback.
**Tech-Strategie:** Capacitor-Wrapper um die bestehende PWA + plattform-abstrahierter BLE-Hook. Referenzprotokoll: [cdump/radiacode](https://github.com/cdump/radiacode).

## Motivation

Das Projekt enthält bereits vollständige Radiacode-Spektrum-Parser für XML/rcspg/CSV-Dateien ([spectrumParser.ts](../../src/common/spectrumParser.ts)) sowie Strahlenschutz-Berechnungen inkl. Inverse-Square-Gesetz und Abschirmung ([strahlenschutz.ts](../../src/common/strahlenschutz.ts)). Was fehlt, ist die **Live-Messpunkt-Erfassung** während eines Einsatzes: Dosisleistung + GPS-Position in Echtzeit in die Karte schreiben, damit die Einsatzleitung ein räumliches Bild der Strahlungsverteilung bekommt.

Randbedingungen:

- Android-only (kein iOS-Developer-Account).
- Kern-PWA bleibt unverändert, Bluetooth-Feature läuft über separaten Android-Wrapper.
- Hintergrund-Betrieb (Screen gesperrt) sollte möglich sein, ist aber kein harter Muss.
- Radiacode-BLE nutzt einen Nordic-UART-artigen Service — über Web Bluetooth und Capacitor-BLE-Plugin gleichermaßen zugänglich.

## Plattform-Strategie

**Capacitor-Wrapper** um die bestehende Next.js-PWA. Der Wrapper lädt via `server.url` die Produktions-PWA in die Android-WebView — keine Code-Duplikation, keine separate Release-Pipeline für den App-Inhalt. Plugin-Updates oder Manifest-Änderungen erfordern einen neuen APK-Build, UI-/Logik-Updates nicht.

Die BLE-Implementierung wird plattformabstrahiert: `Capacitor.isNativePlatform()` entscheidet zur Laufzeit zwischen nativem Plugin-Zugriff und Web-Bluetooth-Fallback. Die Web-Variante arbeitet nur im Vordergrund (Chrome kappt BLE in inaktiven Tabs), ist aber als schneller Proof-of-Concept ohne APK-Rebuild nutzbar.

### Capacitor-Projektstruktur

- Neues Unterverzeichnis `capacitor/` mit eigenem `package.json`, Android-Projekt und `capacitor.config.ts`.
- `server.url` zeigt konfigurierbar auf Produktion oder Staging.
- Plugins:
  - `@capawesome-team/capacitor-bluetooth-low-energy` — Haupt-BLE-API, bringt `startForegroundService()` zum Offenhalten der Verbindung im Hintergrund.
  - `@capacitor/preferences` — persistente Speicherung des Standardgeräts.
  - `@capacitor/geolocation` — native GPS-Permissions + höhere Genauigkeit als Browser-API, Background-tauglich.
- Android-Manifest-Permissions: `BLUETOOTH_CONNECT`, `BLUETOOTH_SCAN`, `ACCESS_FINE_LOCATION`, `FOREGROUND_SERVICE`, `FOREGROUND_SERVICE_LOCATION`, `WAKE_LOCK`.
- Distribution zunächst Sideload über signierten CI-Artefakt, später optional Play Internal Testing.

## BLE-Abstraktionsschicht

Alle BLE-Interna leben unter `src/hooks/radiacode/`:

```text
src/hooks/radiacode/
  useRadiacodeDevice.ts       // Haupt-Hook (State, Scan/Connect/Disconnect, Live-Werte)
  radiacodeProtocol.ts        // Paket-Framing + Kommandos, portiert aus cdump/radiacode
  bleAdapter.ts               // Gemeinsames Interface, Plattform-Dispatch
  bleAdapter.web.ts           // navigator.bluetooth, Foreground-only
  bleAdapter.capacitor.ts     // @capawesome-team/... Plugin-Variante
  devicePreference.ts         // Standardgerät laden/speichern via Capacitor Preferences
```

### Adapter-Interface

```ts
export interface BleAdapter {
  isSupported(): boolean;
  requestDevice(): Promise<BleDeviceRef>;
  connect(deviceId: string): Promise<BleConnection>;
  disconnect(deviceId: string): Promise<void>;
  onNotification(
    deviceId: string,
    handler: (packet: Uint8Array) => void,
  ): Unsubscribe;
  write(deviceId: string, data: Uint8Array): Promise<void>;
  startForegroundService?(opts: ForegroundServiceOptions): Promise<void>;
  stopForegroundService?(): Promise<void>;
}
```

### Hook-Oberfläche

`useRadiacodeDevice()` liefert:

```ts
{
  device: { id, name, serial } | null;
  connectionState: 'disconnected' | 'scanning' | 'connecting' | 'connected' | 'error';
  measurement: { dosisleistung: number; cps: number; timestamp: number } | null;
  scan(): Promise<void>;             // User-Gesture → Gerätedialog
  connectToSaved(): Promise<void>;   // Standardgerät aus Preferences
  disconnect(): Promise<void>;
  error: string | null;
}
```

### Radiacode-Protokoll

Das Gerät nutzt einen Nordic-UART-artigen Service mit TX/RX-Characteristics. Das [cdump/radiacode](https://github.com/cdump/radiacode) Python-Paket wird als Referenz genommen und für den Scope dieses Features minimal auf TypeScript portiert:

- Paket-Framing (Header + Length + Payload + Checksum).
- Kommando `REQUEST_REALTIME_RATE` (oder Subscribe auf Notifications, je nach was das Gerät sendet).
- Response-Parser, der aus dem Live-Event die Felder `dose_rate` (µSv/h) und `cps` extrahiert.

Spektrum-Download und Settings-Kommandos sind **explizit out-of-scope** für diese erste Ausbaustufe — sie können später auf dieser Abstraktion aufsetzen.

## Datenmodell

### Layer-Erweiterung

`FirecallLayer` bekommt ein neues optionales Feld:

```ts
layerType?: 'generic' | 'radiacode';
```

Bestehende Layer ohne Feld werden als `'generic'` behandelt (kein Migrationsbedarf).

### Factory `createRadiacodeLayer(name: string)`

Erzeugt einen neuen Layer mit vollständig vorkonfiguriertem `dataSchema` und `heatmapConfig`:

```ts
{
  layerType: 'radiacode',
  name,
  defaultVisible: 'true',
  dataSchema: [
    { key: 'dosisleistung', label: 'Dosisleistung', unit: 'µSv/h', type: 'number' },
    { key: 'cps',           label: 'Counts/s',       unit: 'cps',   type: 'number' },
    { key: 'device',        label: 'Gerät',          unit: '',      type: 'text'   },
  ],
  heatmapConfig: {
    enabled: true,
    activeKey: 'dosisleistung',
    visualizationMode: 'interpolation',
    interpolationAlgorithm: 'inv-square',
    interpolationRadius: 30,
    interpolationOpacity: 0.6,
    colorMode: 'auto',
    colorScale: 'log',     // Dosisleistung ist logarithmisch spannender
  },
  sampleRate: 'normal',    // persistente Default-Rate pro Layer
}
```

**Farbskala `log`**: Dosisleistung variiert räumlich oft über mehrere Größenordnungen (Hintergrund 0.1 µSv/h, Hotspot 10 µSv/h). Eine lineare Skala würde den gesamten Bereich unterhalb des Hotspots als "ungefährlich blau" anzeigen. User kann in HeatmapSettings auf `linear` wechseln.

**Persistierte Sample-Rate pro Layer**: Wird eine bestehende Radiacode-Messung fortgesetzt, greift dieselbe Rate automatisch; im TrackStartDialog vorausgewählt, aber änderbar.

### Messpunkt-Schema

Jeder Messpunkt ist ein `FcMarker` (Type `'marker'` aus [firestore.ts:127](../../src/components/firebase/firestore.ts#L127)) im gewählten Layer:

```ts
{
  type: 'marker',
  layer: <radiacodeLayerId>,
  lat, lng,
  name: `${formatTime(ts)} | ${dosisleistung.toFixed(2)} µSv/h`,
  fieldData: { dosisleistung, cps, device: 'RC-102 SN123' },
  accuracy?: number,   // neues optionales Feld auf FirecallItem: GPS-Genauigkeit in m
  created: ts,
}
```

Die Heatmap-Pipeline ([FirecallItemsLayer.tsx](../../src/components/Map/layers/FirecallItemsLayer.tsx)) liest `fieldData[activeKey]` für die Interpolation — unverändert, keine Anpassung nötig.

## UI-Flow

### RecordButton + TrackStartDialog

Der bestehende [RecordButton.tsx](../../src/components/Map/RecordButton.tsx) wird umgebaut: Klick (wenn nicht aktiv) öffnet künftig den **`TrackStartDialog`**, statt direkt das Line-Recording zu starten. Die bisherige Line-Logik bleibt als einer der beiden Modi erhalten.

**Dialog-Sektionen:**

1. **Modus** (Radio):
   - GPS-Track (Linie) — wie bisher, erzeugt ein `Line`-Item.
   - Strahlenmessung (Radiacode) — erzeugt Marker-Punkte mit BLE-Werten.

2. **Ziel-Layer** (nur Radiacode-Modus):
   - Dropdown mit existierenden Radiacode-Layern (`layerType === 'radiacode'`) + Option *"Neuer Layer"*.
   - Bei "Neuer Layer": Textfeld, Default `Messung {formatTimestamp(now)}`.

3. **Sample-Rate** (Radio): Niedrig (10m / 30s) · Normal (5m / 15s) · Hoch (2m / 5s). Gilt beidseitig. Bei Radiacode wird die Wahl in `layer.sampleRate` gespeichert und beim Wiederaufnehmen vorausgewählt.

4. **Radiacode-Gerät** (nur Radiacode):
   - Zeile mit Standardgerät aus Preferences + *Wechseln*-Button.
   - *Wechseln* triggert `bleAdapter.requestDevice()` (Native-Dialog oder Web-Picker) und überschreibt nach erfolgreicher Verbindung die Preference.
   - Wenn kein Standardgerät gespeichert: *Wechseln* heißt stattdessen *Gerät wählen*.

### Recording-Lifecycle

**Starten:**

- Mode = GPS-Track: unveränderte Line-Logik mit konfigurierter Sample-Rate.
- Mode = Radiacode:
  1. Ziel-Layer existiert oder wird per Factory erzeugt.
  2. BLE-Verbindung zum gewählten Gerät.
  3. `startForegroundService()` (nur Capacitor; Web bleibt Foreground).
  4. Position-Watcher startet mit gewählter Sample-Rate.
  5. Pro qualifiziertem GPS-Sample: aktueller `measurement`-Snapshot wird gelesen und als neuer `'marker'`-FirecallItem in den Ziel-Layer geschrieben.
- Button wechselt zu Stop (warning-color); kleines Widget neben dem Button zeigt Live-Dosisleistung + CPS.

**Stoppen:**

- BLE-Disconnect, Foreground-Service beenden.
- Snackbar: "X Messpunkte erfasst".
- Dialog wieder verfügbar für neuen Durchlauf.

### Sampling-Logik

Die bestehende RecordButton-Heuristik "neue Position, wenn Distanz > 5m und ΔT > 1s, oder ΔT > 15s" wird parametrisiert:

```ts
const RATE_CONFIG = {
  niedrig: { minDistance: 10, minInterval: 1,  maxInterval: 30 },
  normal:  { minDistance: 5,  minInterval: 1,  maxInterval: 15 },
  hoch:    { minDistance: 2,  minInterval: 1,  maxInterval: 5  },
};
```

Radiacode-Messpunkte: identische Gating-Logik — ein Punkt schreibt `measurement` und `position` zum gleichen Zeitpunkt. Liegt zum Sample-Zeitpunkt kein aktueller `measurement` vor (Verbindung getrennt), wird der Sample übersprungen und im Error-State vermerkt.

## Heatmap-/Interpolations-Default global ausschalten

**Problem:** Interpolation-Overlays (IDW, Spline, invSquare, Kriging etc.) sind rechenintensiv und fressen auf Mobilgeräten Akku + Framerate. Aktuell sind sie per Default aktiv, sobald ein Layer `heatmapConfig.enabled` hat.

**Änderung** in [FirecallLayer.tsx](../../src/components/Map/layers/FirecallLayer.tsx):

- Heatmap-/Interpolation-Overlays werden in der `LayersControl` künftig mit `checked={false}` angelegt — **unabhängig von `layer.defaultVisible`**. Der User muss sie bewusst aktivieren.
- Der `visibleOverlays`-State wird nicht mehr aus `defaultVisible` vorbefüllt; er füllt sich ausschließlich durch User-Interaktion.
- Gilt sowohl für `visualizationMode: 'heatmap'` als auch `'interpolation'`.
- **Unverändert:** Die Marker-Sichtbarkeit des Layers selbst folgt weiterhin `defaultVisible`. User sieht die Messpunkte weiterhin, nur die teure Überlagerung ist aus.

Wirkung auf bestehende Einsätze: beim nächsten Öffnen sind alle Heatmap-/Interpolation-Overlays aus. Ein Tap in LayersControl reaktiviert sie wie vorher — nichts geht verloren, der User bekommt nur explizite Kontrolle.

## Gerätespeicherung

Persistenz via `@capacitor/preferences` (Native) bzw. `localStorage` (Web):

```text
Key:   radiacode.defaultDevice
Value: { id: string, name: string, serial: string, lastConnected: number }
```

- Beim Öffnen des TrackStartDialogs im Radiacode-Modus wird dieses Gerät vorausgewählt und sein Name angezeigt.
- Klick *Starten* versucht `connectToSaved()`. Schlägt es fehl (Gerät außer Reichweite, anderes Handy), fällt die UI auf *Gerät wählen* zurück.
- *Wechseln* überschreibt die Preference erst nach erfolgreicher Verbindung — ein abgebrochener Scan zerstört keinen funktionierenden Default.
- Auf dem Web merkt der Browser das "granted device" selbst nur bis zum Tab-Close. Preference speichert die letzte bekannte ID+Name für Wiedererkennung in der UI; echter Auto-Connect wie nativ ist nicht möglich.

## Non-Goals / Out-of-Scope

- **iOS-Build** — kein Apple-Developer-Account verfügbar.
- **Spektrum-Download vom Radiacode** live über BLE — bleibt aktuell bei Datei-Import.
- **Radiacode-Einstellungen** ändern (Alarmschwellen etc.) — Gerät bleibt read-only aus App-Sicht.
- **Mehrere Radiacode gleichzeitig** — pro Aufnahme ein Gerät; mehrere parallele Aufnahmen sind nicht vorgesehen.
- **Historische Wiedergabe** / Playback-Modus der aufgezeichneten Punkte — steht als eigenes Feature offen.

## Risiken & Offene Annahmen

- **BLE-Protokoll** ist reverse-engineered (cdump/radiacode). Das Paket-Framing und die Event-Struktur müssen am realen Gerät verifiziert werden, bevor die TS-Implementierung produktiv wird.
- **Background-Stabilität** des Capacitor-Foreground-Services ist herstellerspezifisch — manche Android-OEMs (Xiaomi, Oppo) killen auch Foreground-Services aggressiver. Wird im Feld getestet.
- **GPS-Genauigkeit unter Handy-in-Tasche-Bedingungen** kann schlechter werden. Das `accuracy`-Feld wird mitgeschrieben, damit nachträglich schlechte Punkte erkannt werden können; aktiv gefiltert wird in der ersten Version nicht.
