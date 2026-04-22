# Radiacode Native Firestore-Writer — Design

**Datum:** 2026-04-22
**Branch:** `feat/radiacode-via-bluetooth`
**Ausgangslage:** Auf Android läuft der BLE-Poll des Radiacode im Foreground-Service ([RadiacodeForegroundService.kt](../../capacitor/android/app/src/main/java/at/ffnd/einsatzkarte/RadiacodeForegroundService.kt)). Measurements werden via `emitMeasurement` an die WebView gepushed und dort von [useRadiacodePointRecorder.ts](../../src/hooks/recording/useRadiacodePointRecorder.ts) in Marker verwandelt und via JS-SDK nach Firestore geschrieben.

## Problem

Wenn die WebView im Hintergrund läuft oder das Display aus ist, verliert der JS-Pfad Events — Capacitor `notifyListeners` zwischenspeichert nicht, und gedrosseltes JS kann Writes nicht rechtzeitig ausführen. Messungen, die der Service per BLE bekommt, landen dann nicht in Firestore.

## Ziel

Auf Android schreibt der Foreground-Service Marker direkt über die native Firebase-Firestore-Library nach `call/{firecallId}/item`. Der JS-Write-Pfad wird auf Native-Plattformen deaktiviert; im Browser bleibt er unverändert.

## Entscheidungen

- **Vollständige Metadaten im Service**: firecallId, layerId, sampleRate, Device-Label, Creator-Email werden beim Start an den Service übergeben; native schreibt autonom.
- **Position nativ**: `FusedLocationProviderClient` im Service hält bereits GPS hoch. Der bisher leere `LocationCallback` wird mit einem `@Volatile var lastLocation` gefüllt; TrackRecorder nutzt diesen Stand pro Measurement-Tick.
- **JS-Recorder wird No-Op auf Native**, triggert aber Start/Stop. Zusätzliches `markerWritten`-Event für spätere UI-Nutzung (bisher nicht konsumiert — Infrastruktur only).
- **Auth** via `@capacitor-firebase/authentication`, das Plugin ist bereits Dep; der native Firestore-Client nutzt denselben Sign-In-State wie die WebView.
- **Sample-Regeln 1:1 portiert** aus [sampling.ts](../../src/hooks/radiacode/sampling.ts) + [types.ts RATE_CONFIG](../../src/hooks/radiacode/types.ts).
- **Offline** via Firestore-Default-Persistenz auf Disk. Keine Extra-Queue.
- **Dev/Prod-DB** über `process.env.NEXT_PUBLIC_FIRESTORE_DB`, beim Start an Service durchgereicht, nativ via `FirebaseFirestore.getInstance(dbName)` bei nicht-leerem Wert.

## Architektur

### Neue Kotlin-Komponenten

Package: `at.ffnd.einsatzkarte.radiacode.track`

| Klasse | Zweck | Android-Deps |
|---|---|---|
| `TrackConfig` (data class) | Immutable: firecallId, layerId, sampleRate, deviceLabel, creator, firestoreDb | — |
| `SampleGate` | Port von `shouldSamplePoint` (minDistance/minInterval/maxInterval) | — |
| `Haversine` | `distanceMeters(latA, lngA, latB, lngB): Double` | — |
| `TrackRecorder` | Koordinator: hält Config + `LastSample?`; `onMeasurement(m, loc)` / `stop()` | — (Writer injiziert) |
| `FirestoreMarkerWriter` (interface + impl) | `write(config, m, loc): Task<DocumentReference>` | FirebaseFirestore |

Die ersten drei sind reine JVM-Logik → JUnit-testbar. `TrackRecorder` ist per konstruktor-injiziertem `FirestoreMarkerWriter` testbar.

### Änderungen an bestehenden Komponenten

**`RadiacodeForegroundService`**
- Neue Actions: `ACTION_START_TRACK`, `ACTION_STOP_TRACK`.
- Neue Extras: `EXTRA_FIRECALL_ID`, `EXTRA_LAYER_ID`, `EXTRA_SAMPLE_RATE`, `EXTRA_DEVICE_LABEL`, `EXTRA_CREATOR`, `EXTRA_FIRESTORE_DB`.
- `@Volatile private var trackRecorder: TrackRecorder? = null`.
- `@Volatile private var lastLocation: android.location.Location? = null`.
- Der `LocationCallback` in [`startHighAccuracyLocation`](../../capacitor/android/app/src/main/java/at/ffnd/einsatzkarte/RadiacodeForegroundService.kt#L381) speichert `result.lastLocation` in `lastLocation`.
- Im BLE-`onNotification`-Handler, nach `emitMeasurement(m)`:
  ```kotlin
  trackRecorder?.onMeasurement(m, lastLocation)
  ```
- `ACTION_BLE_DISCONNECT` nullt zusätzlich `trackRecorder` (kein Zombie).

**`RadiacodeNotificationPlugin`**
- `@PluginMethod startTrackRecording(PluginCall)` — validiert Args, sendet `ACTION_START_TRACK` an Service.
- `@PluginMethod stopTrackRecording(PluginCall)` — sendet `ACTION_STOP_TRACK`.
- `static emitMarkerWritten(docId, layerId, lat, lng, timestampMs, dose, cps)` — `notifyListeners("markerWritten", …)`.

### Neue TS-Module

**`src/hooks/radiacode/nativeTrackBridge.ts`**
```ts
export function isNativeTrackingAvailable(): boolean;
export async function nativeStartTrack(opts: NativeTrackOpts): Promise<void>;
export async function nativeStopTrack(): Promise<void>;
export function onNativeMarkerWritten(cb: (e: MarkerWrittenEvent) => void): Unsubscribe;
```

Die interne Plugin-Registrierung läuft unter demselben Namen wie der existierende Bridge (`RadiacodeNotification`).

### Geänderte TS-Module

**`src/hooks/recording/useRadiacodePointRecorder.ts`**
- Zusätzliche Props: `firecallId: string`, `creatorEmail: string` (bisher implizit via `useFirecallItemAdd`).
- Plattform-Weiche: auf `isNativeTrackingAvailable()` ruft der Hook beim `active`-Übergang `nativeStartTrack(...)` und im Cleanup `nativeStopTrack()`. Der Measurement-getriebene `useEffect` (JS-Write-Pfad) bleibt bestehen, wird aber bei `native === true` früh zurückgeworfen (no-op).

**`src/components/Map/RecordButton.tsx`**
- Reicht `firecallId` (via `useFirecallId`) und `creatorEmail` (via `useFirebaseLogin`) an den Hook weiter.

## Datenfluss

**Start:**
```
User tippt Record
→ RecordButton.handleStart → radiacodeActive=true, layerId
  → useRadiacodePointRecorder erkennt active=true
    → native? ja → nativeStartTrack({...}) → Plugin → Service.ACTION_START_TRACK
                   → TrackRecorder(config, FirestoreMarkerWriter)
    → native? nein (Web) → bisheriger JS-Pfad via addItem
```

**Pro BLE-Poll (~500 ms):**
```
GattSession.onNotification(bytes)
→ Reassembler + parseResponse
→ MeasurementDecoder.parse → Measurement m
→ emitMeasurement(m)                              [Live-UI, wie bisher]
→ trackRecorder?.onMeasurement(m, lastLocation):
    1. loc == null?         → return
    2. last == null?        → write, update lastSample
    3. dt < minInterval?    → return
    4. dt >= maxInterval?   → write, update lastSample
    5. distance >= minDist? → write, update lastSample
    6. sonst                → return
   Write:
    FirestoreMarkerWriter.write(config, m, loc)
    → onSuccess: lastSample = (lat, lng, now); emitMarkerWritten(...)
    → onFailure: Log.w, lastSample bleibt unverändert (Offline-Queue des SDK)
```

**Stop:**
```
RecordButton.handleStop
→ setRadiacodeActive(false)
  → useRadiacodePointRecorder Cleanup
    → native? ja → nativeStopTrack() → Plugin → Service.ACTION_STOP_TRACK
                   → trackRecorder.stop(); trackRecorder = null
    (BLE-Session bleibt aktiv — Fix aus c994349)
```

## Firestore-Dokumentschema

Pfad: `call/{firecallId}/item/{autoId}` (unverändert — dieselbe Collection wie JS-Marker).

```json
{
  "type": "marker",
  "name": "0.123 µSv/h",
  "layer": "<layerId>",
  "lat": 47.95,
  "lng": 16.84,
  "fieldData": {
    "dosisleistung": 0.123,
    "cps": 42.0,
    "device": "Radiacode RC-103 (RC-103-012345)"
  },
  "datum":   "<ISO now>",
  "created": "<ISO now>",
  "creator": "<email>",
  "zIndex":  <now-ms-as-long>
}
```

Zeitstempel als ISO-Strings (wie JS), nicht als `Timestamp` — damit bestehende Reader in [firestore.ts](../../src/components/firebase/firestore.ts) unverändert funktionieren. `datum === created` wie im JS-Pfad. Leere/undefined Werte werden nicht geschrieben (mirror des JS-Filters in [useFirecallItemAdd.ts:38-43](../../src/hooks/useFirecallItemAdd.ts#L38-L43)).

**Bewusste Abweichung:** Kein `audit`/`history`-Eintrag pro Marker. Der JS-Pfad ruft `useAuditLog` pro `addItem` auf — das würde nativ hunderte Einträge pro Track erzeugen. Nicht gewünscht.

## Dev/Prod-DB

JS liest `process.env.NEXT_PUBLIC_FIRESTORE_DB` (durch Next.js zur Build-Zeit inlined) und gibt ihn als Extra beim Start durch:

```ts
nativeStartTrack({
  firecallId, layerId, sampleRate, deviceLabel, creator,
  firestoreDb: process.env.NEXT_PUBLIC_FIRESTORE_DB || '',
});
```

`FirestoreMarkerWriter` wählt entsprechend:

```kotlin
private val firestore: FirebaseFirestore =
    if (dbName.isBlank()) FirebaseFirestore.getInstance()
    else FirebaseFirestore.getInstance(dbName)  // SDK 25.1.0+
```

Symmetrie zum JS-Client: [firebase.ts:16-18](../../src/components/firebase/firebase.ts#L16-L18) macht dieselbe Unterscheidung. Beide Flows aus derselben `.env.local`-Variable gespeist.

## Error-Handling & Edge Cases

| Szenario | Verhalten |
|---|---|
| GPS-Permission entzogen | `lastLocation` stagniert → neue Ticks skip-pen, bis wieder Fix kommt. |
| Erster Tick vor erstem GPS-Fix | `lastLocation == null` → skip. Typisch 1–2s Verzögerung. |
| Firebase-User nicht angemeldet | Write failt mit Rules-Error. Einmal pro Track loggen, nicht pro Tick. |
| Offline | SDK queued persistent auf Disk (Default). Auto-Flush beim Reconnect. |
| BLE-Reconnect mitten im Track | Recorder läuft weiter; nur `onMeasurement` pausiert solange keine Daten. `lastSample` bleibt. |
| Track-Stop während Write in flight | `stop()` setzt Flag; laufender Write darf fertig werden, neue abgelehnt. |
| firecallId wechselt | useEffect-Deps triggern Stop+Start → neuer TrackRecorder mit neuer Config. |
| `emitMarkerWritten` ohne Plugin-Instanz | Early-return + Log, analog `emitNotification`. |

## Build-Dependencies

[capacitor/android/app/build.gradle](../../capacitor/android/app/build.gradle):

```gradle
implementation platform("com.google.firebase:firebase-bom:33.3.0")
implementation "com.google.firebase:firebase-firestore-ktx"
implementation "com.google.firebase:firebase-auth-ktx"
```

BOM für konsistente Versionen. `firebase-auth` transitiv via `@capacitor-firebase/authentication`, aber explizit deklariert für Stabilität.

Keine neuen Permissions — `INTERNET` ist bereits da, BLE/Location auch.

## Tests

### Kotlin (JUnit, Android-frei wo möglich)
- **`SampleGateTest`** — tabular per Sample-Rate × (min/max-Interval, Distanz-Schwellen). Spiegelt [sampling.test nicht vorhanden → neu].
- **`HaversineTest`** — 3–4 Fixpunkte gegen bekannte Entfernungen.
- **`TrackRecorderTest`** — mit Fake-`FirestoreMarkerWriter` (captures). Fälle:
  - Erster Tick + Location → write + `lastSample` gesetzt.
  - Zweiter Tick <minDistance + <maxInterval → skip.
  - Tick nach maxInterval → write trotz Distanz 0.
  - Tick ohne Location → skip.
  - `stop()` verhindert weitere Writes.

### TypeScript (Vitest)
- **`useRadiacodePointRecorder.test.tsx`** — neuer Fall: `isNativeTrackingAvailable() === true` → `nativeStartTrack` mit korrekten Opts + `nativeStopTrack` im Cleanup; `addItem` wird **nicht** aufgerufen. Web-Testfälle unverändert.
- **`nativeTrackBridge.test.ts`** — Plugin-Mock, prüft Argument-Mapping Promise-Resolution.

### Manuell (Smoke)
- Track starten, App in Hintergrund, 10 Minuten warten, prüfen ob Marker im Firestore landen.
- Flugmodus einschalten während Track läuft, 2 Minuten warten, Flugmodus aus → Marker werden nachträglich sichtbar.

## Nicht-Ziele

- Spektrum-Snapshots nativ schreiben.
- GPS-Line-Recorder (`useGpsLineRecorder`).
- Konkrete UI-Änderungen für `markerWritten` (Infrastruktur only).
- Einmaliger Audit-Summary-Eintrag am Track-Ende (zurückgestellt, YAGNI).

## Offene Fragen

Keine — alle Entscheidungen sind im Brainstorming geklärt.
