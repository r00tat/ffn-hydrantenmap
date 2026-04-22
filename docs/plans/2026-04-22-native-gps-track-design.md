# Native GPS-Track-Aufzeichnung (Android) — Design

Stand: 2026-04-22 · Branch: `feat/native-gps-track`

## Ziel

Klassische GPS-Track-Aufzeichnung (ohne Radiacode) soll im Android-Native-Build auch im
Standby bzw. bei gesperrtem Bildschirm weiterlaufen. Heute läuft sie nur solange die App im
Vordergrund und der Bildschirm entsperrt ist — der Web-`watchPosition()`-Loop in
`useGpsLineRecorder` wird sonst angehalten.

Gleichzeitig erweitern wir das Sampling um einen **Custom-Modus**, bei dem User eigene
Schwellwerte (Zeit, Abstand, Dosisleistungs-Delta) angeben können, und der neue Punkt
geschrieben wird, sobald **eines** der Kriterien überschritten wird.

## Ausgangslage

- `useGpsLineRecorder` (TS): legt ein `Line`-Firecall-Item an, hängt Positionen als
  JSON-Array an `positions`, aktualisiert `destLat`/`destLng`/`distance`. Heuristik
  ≥ 5 m oder ≥ 15 s.
- `RadiacodeForegroundService` (Kotlin): hält Foreground-Notification +
  `FusedLocationProviderClient` in `HIGH_ACCURACY` am Leben, solange die
  Radiacode-BLE-Session läuft. Dort kann der `TrackRecorder` beim Eintreffen einer
  Messung einen Marker schreiben.
- Bridge: `RadiacodeNotification`-Capacitor-Plugin (Java/Kotlin ↔ TS) mit Actions
  wie `ACTION_START_TRACK` / `ACTION_STOP_TRACK`.
- UI: `TrackStartDialog` mit Modi `gps | radiacode` und Sample-Rate-Presets
  `niedrig | normal | hoch`.

## Überblick

1. Bestehenden Foreground-Service generalisieren, sodass er **zwei** unabhängig
   startbare Sessions hostet: BLE (Radiacode) und GPS-Track. Jede hält den Service am
   Leben; fehlt beides → `stopSelf()`.
2. Neuen nativen GPS-Track-Recorder (Kotlin) bauen, der via `LocationCallback` über
   die schon existierende HIGH_ACCURACY-Quelle gespeist wird.
3. Schreiben ins bestehende `Line`-Firecall-Item (`positions`-JSON); das Line-Item wird
   vorab in TS angelegt (bekommt Firestore-ID), Service bekommt nur die `lineId` und
   hängt Positionen an.
4. Sample-Rate-Modell um `Custom` erweitern (OR-Logik + 1 s Floor). Presets mappen
   intern auf Custom-Werte, damit nur ein Codepfad zu testen ist.
5. UI: `TrackStartDialog` bekommt ein viertes Radio "Custom" mit drei Zahlenfeldern
   (Dose-Feld nur im Radiacode-Mode sichtbar).
6. TS-Recorder bekommt einen Plattform-Switch: Native → Bridge, Web → bisheriges
   `watchPosition`-Verhalten.

## Service-Architektur

Der `RadiacodeForegroundService` bleibt vom Class-Namen gleich (Manifest-Referenzen
und Plugin-Name bleiben stabil), wird aber semantisch erweitert:

### Neue Actions

- `ACTION_START_GPS_TRACK` — Extras: `EXTRA_FIRECALL_ID`, `EXTRA_LINE_ID`,
  `EXTRA_SAMPLE_RATE_KIND` (`niedrig`/`normal`/`hoch`/`custom`),
  `EXTRA_CUSTOM_INTERVAL`, `EXTRA_CUSTOM_DISTANCE`,
  `EXTRA_FIRESTORE_DB`, `EXTRA_CREATOR`, `EXTRA_INITIAL_LAT`, `EXTRA_INITIAL_LNG`.
- `ACTION_STOP_GPS_TRACK` — schliesst Recorder; Location wird nur gestoppt, wenn
  keine weitere Session (BLE) lebt.

### Lifecycle

- `startForeground`-Type bleibt dynamisch via `resolveForegroundServiceType()` —
  bei aktiver GPS-Track-Session wird `LOCATION` gesetzt (unabhängig von BLE; heute
  schon der Fall wegen Permission-Check).
- `onTaskRemoved(rootIntent)`: wenn GPS-Track-Session aktiv ist, Recorder stoppen
  und (falls keine BLE-Session läuft) `stopSelf()`. BLE-Sessions überleben Swipe
  wie heute.
- Notification-Text reflektiert Status: "GPS-Aufzeichnung läuft" (GPS-only),
  "Radiacode verbunden" (BLE), beides kombiniert wenn aktiv.

## Neues Modul: `gpstrack`

Verzeichnis: `capacitor/android/app/src/main/java/at/ffnd/einsatzkarte/gpstrack/`

- `GpsTrackConfig(firecallId, lineId, sampleRate, firestoreDb, creator)`
- `GpsTrackRecorder`
  - `onLocation(loc: Location)` — gated durch `SampleGate`, delegiert an
    `LineUpdater`.
  - `stop()` — markiert als gestoppt, weitere Fixes werden ignoriert.
  - Hält `last: { lat, lng, time }`.
- `LineUpdater` (Interface)
- `FirestoreLineUpdater`
  - `append(lineId, lat, lng, ts)` — liest Doc, hängt an `positions`-JSON an,
    updatet `destLat`/`destLng`/`distance`. Firestore-SDK-Queue übernimmt
    Offline-Retry.

## SampleGate (Erweiterung)

Datei: `capacitor/android/app/src/main/java/at/ffnd/einsatzkarte/radiacode/track/SampleGate.kt`

### Neues Modell

```kotlin
sealed class SampleRate {
    data object Niedrig : SampleRate()  // dist=10m, maxInt=30s
    data object Normal  : SampleRate()  // dist= 5m, maxInt=15s
    data object Hoch    : SampleRate()  // dist= 2m, maxInt= 5s
    data class Custom(
        val maxIntervalSec: Double?,
        val minDistanceMeters: Double?,
        val minDoseRateDeltaUSvH: Double?, // nur Radiacode-Pfad
    ) : SampleRate()
}
```

### Gate-Logik

`SampleGate.shouldSample(distanceM: Double, dtSec: Double,
doseRateDeltaUSvH: Double? = null, rate: SampleRate): Boolean`:

1. Intern in `Custom` normalisieren (Presets → fester `Custom`-Wert ohne
   `minDoseRateDeltaUSvH`).
2. **Harter Floor**: `dtSec < 1.0` → `false`.
3. OR über die gesetzten Kriterien:
   - `maxIntervalSec != null && dtSec >= maxIntervalSec` → `true`
   - `minDistanceMeters != null && distanceM >= minDistanceMeters` → `true`
   - `minDoseRateDeltaUSvH != null && doseRateDeltaUSvH != null && abs >= schwelle` → `true`
4. Sonst `false`.

Der Radiacode-Recorder merkt sich zusätzlich die Dosisleistung des letzten
geschriebenen Samples, um das Delta zu bilden.

`SampleRateConfig` (bestehend, Data-Class mit `minDistance/minInterval/maxInterval`)
bleibt als reine Daten-Container-Klasse — für Presets fungiert sie weiter, und
`SampleRateConfig.of(String)` → `SampleRate`-Enum wird ergänzt.

## Capacitor-Bridge

Dateien: `src/hooks/radiacode/nativeTrackBridge.ts` (erweitert),
`src/hooks/recording/nativeGpsTrackBridge.ts` (neu).

### Neue Methoden

```ts
interface GpsTrackPlugin {
  startGpsTrack(opts: {
    firecallId: string;
    lineId: string;
    firestoreDb: string;
    creator: string;
    sampleRate: SampleRateSpec;
    initialLat?: number;
    initialLng?: number;
  }): Promise<void>;
  stopGpsTrack(): Promise<void>;
}

export type SampleRateSpec =
  | 'niedrig' | 'normal' | 'hoch'
  | { kind: 'custom'; intervalSec?: number; distanceM?: number; doseRateDeltaUSvH?: number };
```

Serialisierung an Android: getrennte Extras (siehe Service-Actions oben), keine
JSON-Strings — konsistent mit bestehendem Stil.

## TS-Integration

### `useGpsLineRecorder` (anpassen)

- Bekommt optional eine `sampleRate: SampleRateSpec`.
- Auf Native-Plattform (Android):
  - `startRecording(pos)`: Line-Item wie heute in TS anlegen → `id` erhalten →
    `nativeStartGpsTrack({ lineId: id, …, initialLat: pos.lat, initialLng: pos.lng })`.
  - `stopRecording()`: `nativeStopGpsTrack()`. Der finale Fix wird vom nativen
    Service beim Stop selbst geschrieben.
  - Web-Polling-`useEffect` ist in dieser Codebahn stumm.
- Auf Web-Plattform: bestehendes Verhalten unverändert.

### `TrackStartDialog` (erweitern)

- Zusätzlich zum bestehenden Radio `niedrig | normal | hoch` ein `custom`.
- Bei Custom: Eingabefelder
  - **Abstand (m)** — `number`, leer = deaktiviert.
  - **Zeitintervall (s)** — `number`, leer = deaktiviert.
  - **Dosisleistungs-Delta (µSv/h)** — nur wenn `mode === 'radiacode'`.
- Validierung: Start-Button disabled + Tooltip, wenn alle drei leer.
- Custom ist auch im GPS-Mode verfügbar (ohne Dose-Feld).

### `TrackStartConfig`

```ts
export interface TrackStartConfig {
  mode: TrackMode;
  layer: LayerChoice | null;
  sampleRate: SampleRateSpec;   // war: SampleRate (String-Enum)
  device: RadiacodeDeviceRef | null;
}
```

`RecordButton` übergibt die Spec sowohl an die Radiacode-Bahn als auch an den
neuen GPS-Pfad.

### `Line`-Firestore-Snapshot

Keine Änderung. Das UI rendert die Linie wie heute via Firecall-Item-Listener; die
nativen Updates kommen über Firestore in die WebView.

## Persistenz

- **GPS-only**: Sample-Rate wird nicht am Line-Item persistiert (Track ist
  kurzlebig, auf Stop beendet).
- **Radiacode-Layer**: `layer.sampleRate` wird von `'niedrig' | 'normal' | 'hoch'`
  auf obigen Union-Typ erweitert. Beim Laden von Altdaten (Strings) wird 1:1
  gemappt — kein Migrations-Script nötig.

## Permissions

Keine neuen Manifest-Permissions (FINE/COARSE_LOCATION + FOREGROUND_SERVICE_LOCATION
bestehen). Runtime-Check: Service refusiert `ACTION_START_GPS_TRACK`, wenn
`ACCESS_FINE_LOCATION` nicht granted ist.

## Tests

### Kotlin

- `SampleGateTest`: Custom mit nur Zeit / nur Distanz / nur Dose; Kombinationen;
  leere Custom; 1 s-Floor greift auch bei Custom.
- `GpsTrackRecorderTest`: erster Fix schreibt sofort; zweiter gated; Stop
  verhindert weitere Writes.
- `FirestoreLineUpdaterTest`: Fake-Firestore, Shape des Updates
  (`positions`-Append, `destLat/Lng`, `distance`).

### TS

- `nativeGpsTrackBridge.test.ts`: Plugin-Aufruf mit korrekter Serialisierung für
  alle Modi + Custom-Parameter.
- `useGpsLineRecorder.test.tsx`: Native-Plattform-Mock → Bridge wird gerufen,
  Web-Polling deaktiviert; Web-Plattform → bisheriges Verhalten.
- `TrackStartDialog.test.tsx`: Custom-Radio, Felder sichtbar/versteckt, Dose-Feld
  nur im Radiacode-Mode, Validierung "mindestens eines gesetzt".

### Smoke (manuell, nach Implementierung)

- Android-Gerät: GPS-Track starten, Bildschirm sperren, 2 Minuten warten,
  entsperren → Track-Linie hat weiter Punkte bekommen.

## Risiken & offene Punkte

- **Concurrent-Write-Race**: zwei Clients können dasselbe `Line.positions`
  gleichzeitig überschreiben. Bleibt wie heute (gleiches Risiko existiert im
  Web-Recorder).
- **Battery**: HIGH_ACCURACY-GPS + Foreground-Service kostet Akku. Akzeptabel,
  passt zum Einsatzszenario.
