# Radiacode Native Firestore-Writer Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Android-Foreground-Service schreibt Radiacode-Track-Marker direkt via native Firebase-Firestore-SDK nach `call/{firecallId}/item`, unabhängig vom Zustand der WebView. Web-only-Fallback bleibt unverändert.

**Architecture:** Siehe [2026-04-22-radiacode-native-firestore-design.md](2026-04-22-radiacode-native-firestore-design.md). Kurzfassung: Neue Kotlin-Komponenten im Package `at.ffnd.einsatzkarte.radiacode.track` (TrackConfig, SampleGate, Haversine, TrackRecorder, FirestoreMarkerWriter). `RadiacodeForegroundService` + `RadiacodeNotificationPlugin` bekommen Start/Stop-Track-Actions und ein `markerWritten`-Event. JS-Hook `useRadiacodePointRecorder` routet auf Native-Plattformen via neuer Bridge `nativeTrackBridge.ts` durch den Service; im Web läuft der bestehende JS-Pfad weiter.

**Tech Stack:** Kotlin (Android Foreground-Service), Java (Capacitor-Plugin), JUnit 4, TypeScript + Vitest + React Testing Library, Firebase Firestore Android SDK (via BOM 33.3.0), Capacitor 7, Next.js 16.

**Projekt-Konventionen (wichtig):**
- **Keine Zwischen-Commits** während der Implementierung — alle Änderungen am Ende in einem einzigen Commit.
- **Keine `npm run check` zwischen Tasks** — nur am Ende des Plans einmal die einzelnen Checks (`tsc --noEmit`, `eslint`, `vitest run`, `next build --webpack`).
- **TDD**: Tests liegen direkt neben Source (`foo.test.ts` neben `foo.ts`), kein `__tests__/`-Ordner.
- **Conventional Commits** auf Deutsch.
- **TypeScript-Fehler niemals ignorieren** — auch nicht „scheinbar vorbestehende".

---

## Phase A — Pure Kotlin-Logik (ohne Android-Deps)

Diese Phase implementiert die Sample-Gate-Algorithmik und Haversine-Distanz als reine JVM-Klassen. Alles ist mit JUnit 4 (bereits Dep im Projekt, siehe [build.gradle](../../capacitor/android/app/build.gradle)) ohne Android-Mocks testbar.

### Task A1: `SampleGate` + Test

**Files:**
- Create: `capacitor/android/app/src/main/java/at/ffnd/einsatzkarte/radiacode/track/SampleGate.kt`
- Create: `capacitor/android/app/src/test/java/at/ffnd/einsatzkarte/radiacode/track/SampleGateTest.kt`

**Referenz-Code** (der zu portieren ist): [src/hooks/radiacode/sampling.ts](../../src/hooks/radiacode/sampling.ts) und [src/hooks/radiacode/types.ts:9-13](../../src/hooks/radiacode/types.ts#L9-L13).

**Step 1: Test zuerst schreiben**

```kotlin
// SampleGateTest.kt
package at.ffnd.einsatzkarte.radiacode.track

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class SampleGateTest {
    private val normal = SampleRateConfig(minDistanceMeters = 5.0, minIntervalSec = 1.0, maxIntervalSec = 15.0)

    @Test fun `skips when below minInterval`() {
        assertFalse(SampleGate.shouldSample(distanceMeters = 100.0, secondsSinceLast = 0.5, config = normal))
    }

    @Test fun `writes when maxInterval exceeded even if distance is zero`() {
        assertTrue(SampleGate.shouldSample(distanceMeters = 0.0, secondsSinceLast = 20.0, config = normal))
    }

    @Test fun `writes when distance above minDistance and above minInterval`() {
        assertTrue(SampleGate.shouldSample(distanceMeters = 10.0, secondsSinceLast = 2.0, config = normal))
    }

    @Test fun `skips when distance below minDistance and still under maxInterval`() {
        assertFalse(SampleGate.shouldSample(distanceMeters = 2.0, secondsSinceLast = 2.0, config = normal))
    }

    @Test fun `rate config table matches TS RATE_CONFIG`() {
        val niedrig = SampleRateConfig.of("niedrig")
        val normalCfg = SampleRateConfig.of("normal")
        val hoch = SampleRateConfig.of("hoch")
        assertTrue(niedrig.minDistanceMeters == 10.0 && niedrig.minIntervalSec == 1.0 && niedrig.maxIntervalSec == 30.0)
        assertTrue(normalCfg.minDistanceMeters == 5.0 && normalCfg.minIntervalSec == 1.0 && normalCfg.maxIntervalSec == 15.0)
        assertTrue(hoch.minDistanceMeters == 2.0 && hoch.minIntervalSec == 1.0 && hoch.maxIntervalSec == 5.0)
    }
}
```

**Step 2: Implementation**

```kotlin
// SampleGate.kt
package at.ffnd.einsatzkarte.radiacode.track

data class SampleRateConfig(
    val minDistanceMeters: Double,
    val minIntervalSec: Double,
    val maxIntervalSec: Double,
) {
    companion object {
        fun of(rate: String): SampleRateConfig = when (rate) {
            "niedrig" -> SampleRateConfig(10.0, 1.0, 30.0)
            "normal"  -> SampleRateConfig(5.0, 1.0, 15.0)
            "hoch"    -> SampleRateConfig(2.0, 1.0, 5.0)
            else      -> throw IllegalArgumentException("Unknown sample rate: $rate")
        }
    }
}

object SampleGate {
    fun shouldSample(distanceMeters: Double, secondsSinceLast: Double, config: SampleRateConfig): Boolean {
        if (secondsSinceLast < config.minIntervalSec) return false
        if (secondsSinceLast >= config.maxIntervalSec) return true
        return distanceMeters >= config.minDistanceMeters
    }
}
```

**Hinweis:** Der Unit-Test läuft später zusammen mit den anderen Tests im Phase-E-Checkpoint. Keine Zwischen-Ausführung nötig.

---

### Task A2: `Haversine` + Test

**Files:**
- Create: `capacitor/android/app/src/main/java/at/ffnd/einsatzkarte/radiacode/track/Haversine.kt`
- Create: `capacitor/android/app/src/test/java/at/ffnd/einsatzkarte/radiacode/track/HaversineTest.kt`

**Referenz:** npm-Paket `haversine-distance` (das JS verwendet in [useRadiacodePointRecorder.ts:73-76](../../src/hooks/recording/useRadiacodePointRecorder.ts#L73-L76)). Standardformel mit R = 6371000 m.

**Step 1: Test**

```kotlin
// HaversineTest.kt
package at.ffnd.einsatzkarte.radiacode.track

import org.junit.Assert.assertEquals
import org.junit.Test

class HaversineTest {
    @Test fun `same point yields zero`() {
        assertEquals(0.0, Haversine.distanceMeters(48.0, 16.0, 48.0, 16.0), 0.001)
    }

    @Test fun `11 meters north of Neusiedl`() {
        // 0.0001 degrees latitude ≈ 11.1 m
        val d = Haversine.distanceMeters(47.9500, 16.8400, 47.9501, 16.8400)
        assertEquals(11.1, d, 0.2)
    }

    @Test fun `known-distance vienna-graz 145km`() {
        // Wien (48.2082,16.3738) → Graz (47.0707,15.4395) ≈ 145 km
        val d = Haversine.distanceMeters(48.2082, 16.3738, 47.0707, 15.4395)
        assertEquals(145_000.0, d, 2_000.0)
    }
}
```

**Step 2: Implementation**

```kotlin
// Haversine.kt
package at.ffnd.einsatzkarte.radiacode.track

import kotlin.math.asin
import kotlin.math.cos
import kotlin.math.sin
import kotlin.math.sqrt

object Haversine {
    private const val EARTH_RADIUS_M = 6_371_000.0

    fun distanceMeters(latA: Double, lngA: Double, latB: Double, lngB: Double): Double {
        val dLat = Math.toRadians(latB - latA)
        val dLng = Math.toRadians(lngB - lngA)
        val a = sin(dLat / 2).let { it * it } +
            cos(Math.toRadians(latA)) * cos(Math.toRadians(latB)) *
            sin(dLng / 2).let { it * it }
        val c = 2 * asin(sqrt(a))
        return EARTH_RADIUS_M * c
    }
}
```

---

### Task A3: `TrackConfig` (reine Datenklasse)

**Files:**
- Create: `capacitor/android/app/src/main/java/at/ffnd/einsatzkarte/radiacode/track/TrackConfig.kt`

Keine Tests — trivial.

```kotlin
// TrackConfig.kt
package at.ffnd.einsatzkarte.radiacode.track

data class TrackConfig(
    val firecallId: String,
    val layerId: String,
    val sampleRate: SampleRateConfig,
    val deviceLabel: String,
    val creator: String,
    val firestoreDb: String, // "" = default DB
)
```

---

### Task A4: `TrackRecorder` + Test (Fake Writer)

**Files:**
- Create: `capacitor/android/app/src/main/java/at/ffnd/einsatzkarte/radiacode/track/TrackRecorder.kt`
- Create: `capacitor/android/app/src/main/java/at/ffnd/einsatzkarte/radiacode/track/MarkerWriter.kt` (Interface)
- Create: `capacitor/android/app/src/test/java/at/ffnd/einsatzkarte/radiacode/track/TrackRecorderTest.kt`

**Step 1: Marker-Writer-Interface**

```kotlin
// MarkerWriter.kt
package at.ffnd.einsatzkarte.radiacode.track

import at.ffnd.einsatzkarte.radiacode.Measurement

data class MarkerWriteResult(val docId: String, val lat: Double, val lng: Double, val timestampMs: Long, val dosisleistungUSvH: Double, val cps: Double, val layerId: String)

interface MarkerWriter {
    /** Asynchron schreibt, ruft onSuccess bei Erfolg mit doc-id, onFailure sonst. */
    fun write(
        config: TrackConfig,
        measurement: Measurement,
        lat: Double,
        lng: Double,
        onSuccess: (MarkerWriteResult) -> Unit,
        onFailure: (Throwable) -> Unit,
    )
}
```

**Step 2: Test zuerst**

```kotlin
// TrackRecorderTest.kt
package at.ffnd.einsatzkarte.radiacode.track

import at.ffnd.einsatzkarte.radiacode.Measurement
import org.junit.Assert.assertEquals
import org.junit.Test

class TrackRecorderTest {

    private fun meas(tsMs: Long = 0L): Measurement = Measurement(
        timestampMs = tsMs,
        dosisleistungUSvH = 0.1,
        cps = 5.0,
        doseUSv = null, durationSec = null, temperatureC = null, chargePct = null,
        dosisleistungErrPct = null, cpsErrPct = null,
    )

    private val config = TrackConfig(
        firecallId = "fc1", layerId = "l1",
        sampleRate = SampleRateConfig.of("normal"),
        deviceLabel = "RC-103 (S1)", creator = "u@x", firestoreDb = "",
    )

    private class FakeWriter : MarkerWriter {
        data class Call(val lat: Double, val lng: Double)
        val calls = mutableListOf<Call>()
        override fun write(config: TrackConfig, measurement: Measurement, lat: Double, lng: Double,
                           onSuccess: (MarkerWriteResult) -> Unit, onFailure: (Throwable) -> Unit) {
            calls += Call(lat, lng)
            onSuccess(MarkerWriteResult("doc${calls.size}", lat, lng, measurement.timestampMs,
                measurement.dosisleistungUSvH, measurement.cps, config.layerId))
        }
    }

    @Test fun `no write without location`() {
        val w = FakeWriter()
        val r = TrackRecorder(config, w, nowMs = { 1_000L })
        r.onMeasurement(meas(), loc = null)
        assertEquals(0, w.calls.size)
    }

    @Test fun `first sample with location writes`() {
        val w = FakeWriter()
        val r = TrackRecorder(config, w, nowMs = { 1_000L })
        r.onMeasurement(meas(), loc = LatLng(48.0, 16.0))
        assertEquals(1, w.calls.size)
    }

    @Test fun `second sample skipped when below minInterval`() {
        val w = FakeWriter()
        var now = 1_000L
        val r = TrackRecorder(config, w, nowMs = { now })
        r.onMeasurement(meas(), LatLng(48.0, 16.0))
        now += 500  // 0.5s < minInterval (1s)
        r.onMeasurement(meas(), LatLng(48.0001, 16.0))
        assertEquals(1, w.calls.size)
    }

    @Test fun `second sample written after maxInterval without moving`() {
        val w = FakeWriter()
        var now = 1_000L
        val r = TrackRecorder(config, w, nowMs = { now })
        r.onMeasurement(meas(), LatLng(48.0, 16.0))
        now += 16_000  // 16s > maxInterval (15s)
        r.onMeasurement(meas(), LatLng(48.0, 16.0))
        assertEquals(2, w.calls.size)
    }

    @Test fun `stop prevents further writes`() {
        val w = FakeWriter()
        var now = 1_000L
        val r = TrackRecorder(config, w, nowMs = { now })
        r.onMeasurement(meas(), LatLng(48.0, 16.0))
        r.stop()
        now += 20_000
        r.onMeasurement(meas(), LatLng(48.1, 16.1))
        assertEquals(1, w.calls.size)
    }
}
```

**Step 3: Implementation**

```kotlin
// TrackRecorder.kt
package at.ffnd.einsatzkarte.radiacode.track

import at.ffnd.einsatzkarte.radiacode.Measurement

data class LatLng(val lat: Double, val lng: Double)

class TrackRecorder(
    private val config: TrackConfig,
    private val writer: MarkerWriter,
    private val nowMs: () -> Long = System::currentTimeMillis,
    private val onWriteSuccess: (MarkerWriteResult) -> Unit = {},
) {
    private data class LastSample(val lat: Double, val lng: Double, val time: Long)

    @Volatile private var last: LastSample? = null
    @Volatile private var stopped = false

    fun onMeasurement(measurement: Measurement, loc: LatLng?) {
        if (stopped) return
        if (loc == null) return

        val now = nowMs()
        val lastCopy = last
        val shouldWrite = if (lastCopy == null) {
            true
        } else {
            val distance = Haversine.distanceMeters(lastCopy.lat, lastCopy.lng, loc.lat, loc.lng)
            val dt = (now - lastCopy.time) / 1000.0
            SampleGate.shouldSample(distance, dt, config.sampleRate)
        }
        if (!shouldWrite) return

        last = LastSample(loc.lat, loc.lng, now)
        writer.write(
            config = config, measurement = measurement, lat = loc.lat, lng = loc.lng,
            onSuccess = { onWriteSuccess(it) },
            onFailure = { err ->
                // SDK-Queue übernimmt Offline-Retry; wir resetten last NICHT, damit
                // maxInterval weiter zählt und es nicht zu Marker-Fluten bei Netz-Retry kommt.
                android.util.Log.w("RadiacodeTrack", "marker write failed", err)
            },
        )
    }

    fun stop() {
        stopped = true
    }
}
```

---

## Phase B — Android-Integration

Diese Phase integriert die neuen Klassen in den Foreground-Service + das Capacitor-Plugin. Kein TDD hier — die Integration ist zu sehr an Android-System-State gebunden; wir verifizieren am Ende per Smoke-Test auf Gerät.

### Task B1: Build-Deps für Firebase Firestore

**Files:**
- Modify: `capacitor/android/app/build.gradle`

**Änderung** in `dependencies`-Block, nach der bestehenden `play-services-location`-Zeile ergänzen:

```gradle
    // Firebase Firestore + Auth — nativer Write-Pfad für Radiacode-Track-Marker
    // (siehe docs/plans/2026-04-22-radiacode-native-firestore-design.md).
    implementation platform("com.google.firebase:firebase-bom:33.3.0")
    implementation "com.google.firebase:firebase-firestore-ktx"
    implementation "com.google.firebase:firebase-auth-ktx"
```

---

### Task B2: `FirestoreMarkerWriter` (Android-Impl)

**Files:**
- Create: `capacitor/android/app/src/main/java/at/ffnd/einsatzkarte/radiacode/track/FirestoreMarkerWriter.kt`

```kotlin
package at.ffnd.einsatzkarte.radiacode.track

import android.util.Log
import at.ffnd.einsatzkarte.radiacode.Measurement
import com.google.firebase.firestore.FirebaseFirestore
import java.time.Instant
import java.util.Locale

class FirestoreMarkerWriter(dbName: String) : MarkerWriter {
    companion object { private const val TAG = "RadiacodeTrack" }

    private val firestore: FirebaseFirestore = if (dbName.isBlank()) {
        FirebaseFirestore.getInstance()
    } else {
        FirebaseFirestore.getInstance(dbName)
    }.also { Log.i(TAG, "Firestore DB = ${if (dbName.isBlank()) "(default)" else dbName}") }

    override fun write(
        config: TrackConfig,
        measurement: Measurement,
        lat: Double,
        lng: Double,
        onSuccess: (MarkerWriteResult) -> Unit,
        onFailure: (Throwable) -> Unit,
    ) {
        val nowIso = Instant.now().toString()
        val data = linkedMapOf<String, Any>(
            "type" to "marker",
            "name" to String.format(Locale.US, "%.3f µSv/h", measurement.dosisleistungUSvH),
            "layer" to config.layerId,
            "lat" to lat,
            "lng" to lng,
            "fieldData" to mapOf(
                "dosisleistung" to measurement.dosisleistungUSvH,
                "cps" to measurement.cps,
                "device" to config.deviceLabel,
            ),
            "datum" to nowIso,
            "created" to nowIso,
            "creator" to config.creator,
            "zIndex" to System.currentTimeMillis(),
        )

        firestore.collection("call").document(config.firecallId).collection("item")
            .add(data)
            .addOnSuccessListener { ref ->
                onSuccess(
                    MarkerWriteResult(
                        docId = ref.id, lat = lat, lng = lng,
                        timestampMs = measurement.timestampMs,
                        dosisleistungUSvH = measurement.dosisleistungUSvH,
                        cps = measurement.cps,
                        layerId = config.layerId,
                    )
                )
            }
            .addOnFailureListener { err -> onFailure(err) }
    }
}
```

**Hinweis:** Die Collection-Namen `"call"` und `"item"` sind Literale aus [firestore.ts:12-13](../../src/components/firebase/firestore.ts#L12-L13) — bewusst dupliziert (JS kann dem Kotlin-Code keine Konstante geben).

---

### Task B3: Service-Actions + Recorder-Lifecycle

**Files:**
- Modify: `capacitor/android/app/src/main/java/at/ffnd/einsatzkarte/RadiacodeForegroundService.kt`

**Änderung 1**: In `companion object` neue Konstanten ergänzen (nach `ACTION_BLE_DISCONNECT`):

```kotlin
        const val ACTION_START_TRACK = "at.ffnd.einsatzkarte.RADIACODE_START_TRACK"
        const val ACTION_STOP_TRACK = "at.ffnd.einsatzkarte.RADIACODE_STOP_TRACK"

        const val EXTRA_FIRECALL_ID = "firecallId"
        const val EXTRA_LAYER_ID = "layerId"
        const val EXTRA_SAMPLE_RATE = "sampleRate"
        const val EXTRA_DEVICE_LABEL = "deviceLabel"
        const val EXTRA_CREATOR = "creator"
        const val EXTRA_FIRESTORE_DB = "firestoreDb"
```

**Änderung 2**: Imports ergänzen:

```kotlin
import at.ffnd.einsatzkarte.radiacode.track.FirestoreMarkerWriter
import at.ffnd.einsatzkarte.radiacode.track.LatLng
import at.ffnd.einsatzkarte.radiacode.track.SampleRateConfig
import at.ffnd.einsatzkarte.radiacode.track.TrackConfig
import at.ffnd.einsatzkarte.radiacode.track.TrackRecorder
```

**Änderung 3**: Neue Felder in der Klasse (nach `locationActive`):

```kotlin
    @Volatile private var lastLocation: android.location.Location? = null
    @Volatile private var trackRecorder: TrackRecorder? = null
```

**Änderung 4**: Den leeren `LocationCallback` in `startHighAccuracyLocation()` ([L403-408](../../capacitor/android/app/src/main/java/at/ffnd/einsatzkarte/RadiacodeForegroundService.kt#L403-L408)) füllen:

```kotlin
        val cb = object : LocationCallback() {
            override fun onLocationResult(result: LocationResult) {
                // WebView konsumiert die Position selbst. Wir merken zusätzlich
                // den letzten Fix, damit TrackRecorder auch im Hintergrund weiss,
                // wo der nächste Marker hinsoll.
                result.lastLocation?.let { lastLocation = it }
            }
        }
```

**Änderung 5**: In `onStartCommand` im `when (action)`-Block zwei neue Zweige ergänzen (vor `ACTION_BLE_DISCONNECT`):

```kotlin
            ACTION_START_TRACK -> {
                val firecallId = intent.getStringExtra(EXTRA_FIRECALL_ID)
                val layerId = intent.getStringExtra(EXTRA_LAYER_ID)
                val rate = intent.getStringExtra(EXTRA_SAMPLE_RATE)
                val deviceLabel = intent.getStringExtra(EXTRA_DEVICE_LABEL) ?: ""
                val creator = intent.getStringExtra(EXTRA_CREATOR) ?: ""
                val firestoreDb = intent.getStringExtra(EXTRA_FIRESTORE_DB) ?: ""
                if (firecallId.isNullOrBlank() || layerId.isNullOrBlank() || rate.isNullOrBlank()) {
                    Log.w(TAG, "ACTION_START_TRACK rejected — missing required extras")
                } else {
                    val config = TrackConfig(
                        firecallId = firecallId, layerId = layerId,
                        sampleRate = SampleRateConfig.of(rate),
                        deviceLabel = deviceLabel, creator = creator,
                        firestoreDb = firestoreDb,
                    )
                    trackRecorder?.stop()
                    trackRecorder = TrackRecorder(
                        config = config,
                        writer = FirestoreMarkerWriter(firestoreDb),
                        onWriteSuccess = { r ->
                            RadiacodeNotificationPlugin.emitMarkerWritten(
                                r.docId, r.layerId, r.lat, r.lng,
                                r.timestampMs, r.dosisleistungUSvH, r.cps,
                            )
                        },
                    )
                    Log.i(TAG, "ACTION_START_TRACK firecallId=$firecallId layerId=$layerId rate=$rate")
                }
            }
            ACTION_STOP_TRACK -> {
                Log.i(TAG, "ACTION_STOP_TRACK")
                trackRecorder?.stop()
                trackRecorder = null
            }
```

**Änderung 6**: Im BLE-`onNotification`-Handler ([L282-293](../../capacitor/android/app/src/main/java/at/ffnd/einsatzkarte/RadiacodeForegroundService.kt#L282-L293)) nach `RadiacodeNotificationPlugin.emitMeasurement(m)` ergänzen:

```kotlin
                    if (m != null) {
                        RadiacodeNotificationPlugin.emitMeasurement(m)
                        trackRecorder?.onMeasurement(
                            m,
                            lastLocation?.let { LatLng(it.latitude, it.longitude) },
                        )
                    }
```

(Existing-Code umschreiben, damit `m` nicht doppelt gelesen wird.)

**Änderung 7**: In `teardownSession()` ([L353-367](../../capacitor/android/app/src/main/java/at/ffnd/einsatzkarte/RadiacodeForegroundService.kt#L353-L367)) nach `stopPollLoop()` ergänzen:

```kotlin
        trackRecorder?.stop()
        trackRecorder = null
```

**Änderung 8**: In `onDestroy()` analog:

```kotlin
        trackRecorder?.stop()
        trackRecorder = null
```

---

### Task B4: Plugin-Methoden + Event

**Files:**
- Modify: `capacitor/android/app/src/main/java/at/ffnd/einsatzkarte/RadiacodeNotificationPlugin.java`

**Änderung 1**: Nach `disconnectNative` zwei neue `@PluginMethod`s:

```java
    @PluginMethod
    public void startTrackRecording(PluginCall call) {
        String firecallId = call.getString("firecallId");
        String layerId = call.getString("layerId");
        String sampleRate = call.getString("sampleRate");
        String deviceLabel = call.getString("deviceLabel", "");
        String creator = call.getString("creator", "");
        String firestoreDb = call.getString("firestoreDb", "");
        if (firecallId == null || layerId == null || sampleRate == null) {
            call.reject("firecallId, layerId, sampleRate required");
            return;
        }
        Log.i(TAG, "plugin.startTrackRecording firecallId=" + firecallId + " layerId=" + layerId + " rate=" + sampleRate);
        Intent intent = new Intent(getContext(), RadiacodeForegroundService.class);
        intent.setAction(RadiacodeForegroundService.ACTION_START_TRACK);
        intent.putExtra(RadiacodeForegroundService.EXTRA_FIRECALL_ID, firecallId);
        intent.putExtra(RadiacodeForegroundService.EXTRA_LAYER_ID, layerId);
        intent.putExtra(RadiacodeForegroundService.EXTRA_SAMPLE_RATE, sampleRate);
        intent.putExtra(RadiacodeForegroundService.EXTRA_DEVICE_LABEL, deviceLabel);
        intent.putExtra(RadiacodeForegroundService.EXTRA_CREATOR, creator);
        intent.putExtra(RadiacodeForegroundService.EXTRA_FIRESTORE_DB, firestoreDb);
        startService(intent);
        call.resolve();
    }

    @PluginMethod
    public void stopTrackRecording(PluginCall call) {
        Log.i(TAG, "plugin.stopTrackRecording");
        Intent intent = new Intent(getContext(), RadiacodeForegroundService.class);
        intent.setAction(RadiacodeForegroundService.ACTION_STOP_TRACK);
        // Kein startForegroundService — der Service läuft bereits (BLE aktiv).
        getContext().startService(intent);
        call.resolve();
    }
```

**Änderung 2**: Nach `emitConnectionState` neue statische Methode:

```java
    public static void emitMarkerWritten(String docId, String layerId,
                                         double lat, double lng, long timestampMs,
                                         double dosisleistungUSvH, double cps) {
        RadiacodeNotificationPlugin i = instance;
        if (i == null) {
            Log.w(TAG, "emitMarkerWritten — no plugin instance; dropping");
            return;
        }
        JSObject data = new JSObject();
        data.put("docId", docId);
        data.put("layerId", layerId);
        data.put("lat", lat);
        data.put("lng", lng);
        data.put("timestampMs", timestampMs);
        data.put("dosisleistungUSvH", dosisleistungUSvH);
        data.put("cps", cps);
        i.notifyListeners("markerWritten", data);
    }
```

---

## Phase C — TypeScript-Bridge + Hook-Umbau (TDD)

### Task C1: `nativeTrackBridge.ts` + Test

**Files:**
- Create: `src/hooks/radiacode/nativeTrackBridge.ts`
- Create: `src/hooks/radiacode/nativeTrackBridge.test.ts`

**Orientierung:** Das bestehende [src/hooks/radiacode/nativeBridge.ts](../../src/hooks/radiacode/nativeBridge.ts) zeigt das Muster für Capacitor-Plugin-Registrierung + Event-Subscription. Wir **erweitern dasselbe Plugin-Interface**, damit `registerPlugin('RadiacodeNotification')` weiter typed bleibt.

**Step 1: Test (vitest)**

```ts
// nativeTrackBridge.test.ts
import { describe, expect, it, vi } from 'vitest';

const mockStartTrack = vi.fn().mockResolvedValue(undefined);
const mockStopTrack = vi.fn().mockResolvedValue(undefined);
const mockAddListener = vi.fn().mockImplementation(async () => ({
  remove: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@capacitor/core', () => ({
  Capacitor: {
    isNativePlatform: () => true,
    getPlatform: () => 'android',
  },
  registerPlugin: () => ({
    startTrackRecording: mockStartTrack,
    stopTrackRecording: mockStopTrack,
    addListener: mockAddListener,
  }),
}));

describe('nativeTrackBridge', () => {
  it('maps track opts 1:1 to the plugin call', async () => {
    const { nativeStartTrack } = await import('./nativeTrackBridge');
    await nativeStartTrack({
      firecallId: 'fc1',
      layerId: 'l1',
      sampleRate: 'normal',
      deviceLabel: 'RC-103 (S1)',
      creator: 'u@x',
      firestoreDb: '',
    });
    expect(mockStartTrack).toHaveBeenCalledWith({
      firecallId: 'fc1',
      layerId: 'l1',
      sampleRate: 'normal',
      deviceLabel: 'RC-103 (S1)',
      creator: 'u@x',
      firestoreDb: '',
    });
  });

  it('calls the plugin stop method', async () => {
    const { nativeStopTrack } = await import('./nativeTrackBridge');
    await nativeStopTrack();
    expect(mockStopTrack).toHaveBeenCalledTimes(1);
  });

  it('subscribes to markerWritten events', async () => {
    const { onNativeMarkerWritten } = await import('./nativeTrackBridge');
    const cb = vi.fn();
    const unsub = onNativeMarkerWritten(cb);
    // warten bis addListener aufgerufen
    await new Promise((r) => setTimeout(r, 0));
    expect(mockAddListener).toHaveBeenCalledWith('markerWritten', expect.any(Function));
    // Event-Payload
    const handler = mockAddListener.mock.calls[mockAddListener.mock.calls.length - 1]![1] as (e: any) => void;
    handler({ docId: 'd1', layerId: 'l1', lat: 48, lng: 16, timestampMs: 1000, dosisleistungUSvH: 0.1, cps: 5 });
    expect(cb).toHaveBeenCalledWith({
      docId: 'd1', layerId: 'l1', lat: 48, lng: 16,
      timestampMs: 1000, dosisleistungUSvH: 0.1, cps: 5,
    });
    unsub();
  });
});
```

**Step 2: Implementation**

```ts
// nativeTrackBridge.ts
import { Capacitor, PluginListenerHandle, registerPlugin } from '@capacitor/core';

export type NativeSampleRate = 'niedrig' | 'normal' | 'hoch';

export interface NativeTrackOpts {
  firecallId: string;
  layerId: string;
  sampleRate: NativeSampleRate;
  deviceLabel: string;
  creator: string;
  firestoreDb: string;
}

export interface MarkerWrittenEvent {
  docId: string;
  layerId: string;
  lat: number;
  lng: number;
  timestampMs: number;
  dosisleistungUSvH: number;
  cps: number;
}

interface RadiacodeTrackPlugin {
  startTrackRecording(opts: NativeTrackOpts): Promise<void>;
  stopTrackRecording(): Promise<void>;
  addListener(
    event: 'markerWritten',
    listener: (data: MarkerWrittenEvent) => void,
  ): Promise<PluginListenerHandle>;
}

// Dasselbe Capacitor-Plugin wie nativeBridge — wir erweitern nur das
// TS-Interface, um die neuen Methoden typisiert zu haben.
const RadiacodeTrack = registerPlugin<RadiacodeTrackPlugin>('RadiacodeNotification');

export type Unsubscribe = () => void;

export function isNativeTrackingAvailable(): boolean {
  return (
    typeof window !== 'undefined' &&
    Capacitor.isNativePlatform() &&
    Capacitor.getPlatform() === 'android'
  );
}

export async function nativeStartTrack(opts: NativeTrackOpts): Promise<void> {
  console.log('[Radiacode/nativeTrackBridge] startTrack', opts);
  await RadiacodeTrack.startTrackRecording(opts);
}

export async function nativeStopTrack(): Promise<void> {
  console.log('[Radiacode/nativeTrackBridge] stopTrack');
  await RadiacodeTrack.stopTrackRecording();
}

export function onNativeMarkerWritten(
  handler: (e: MarkerWrittenEvent) => void,
): Unsubscribe {
  let listenerHandle: PluginListenerHandle | null = null;
  let unsubscribed = false;
  RadiacodeTrack.addListener('markerWritten', (e) => handler(e))
    .then((h) => {
      if (unsubscribed) {
        void h.remove();
      } else {
        listenerHandle = h;
      }
    })
    .catch(() => {});
  return () => {
    unsubscribed = true;
    listenerHandle?.remove().catch(() => {});
  };
}
```

---

### Task C2: Hook-Umbau `useRadiacodePointRecorder` (TDD)

**Files:**
- Modify: `src/hooks/recording/useRadiacodePointRecorder.ts`
- Modify: `src/hooks/recording/useRadiacodePointRecorder.test.tsx`

**Ziel:** neue Props `firecallId: string`, `creatorEmail: string`, `firestoreDb?: string`. Bei `isNativeTrackingAvailable()` routet der Hook auf Native; der JS-Write-Pfad wird zum No-Op. Bestehende Web-Tests müssen unverändert weiter funktionieren (nur mit den neuen Props gerufen).

**Step 1: Tests um Native-Pfad erweitern**

Neue Imports am Datei-Anfang von `useRadiacodePointRecorder.test.tsx`:

```ts
import * as nativeTrackBridge from '../radiacode/nativeTrackBridge';
```

Am Anfang jeder bestehenden renderHook-Invocation die neuen Pflicht-Props ergänzen:

```ts
firecallId: 'fc1',
creatorEmail: 'u@x',
firestoreDb: '',
```

Und zusätzlich ein neues Test-Describe-Block (am Ende der Datei vor dem abschließenden `});`):

```ts
  describe('native tracking', () => {
    it('delegates to nativeStartTrack/nativeStopTrack when native and skips addItem', async () => {
      const addItem = vi.fn();
      const isAvail = vi.spyOn(nativeTrackBridge, 'isNativeTrackingAvailable').mockReturnValue(true);
      const start = vi.spyOn(nativeTrackBridge, 'nativeStartTrack').mockResolvedValue(undefined);
      const stop = vi.spyOn(nativeTrackBridge, 'nativeStopTrack').mockResolvedValue(undefined);

      const { rerender, unmount } = renderHook(
        (props: Parameters<typeof useRadiacodePointRecorder>[0]) => useRadiacodePointRecorder(props),
        {
          initialProps: {
            active: false,
            layerId: 'l1',
            sampleRate: 'normal',
            device: DEVICE,
            measurement: null,
            position: null,
            addItem,
            firecallId: 'fc1',
            creatorEmail: 'u@x',
            firestoreDb: '',
          },
        },
      );
      rerender({
        active: true,
        layerId: 'l1',
        sampleRate: 'normal',
        device: DEVICE,
        measurement: meas(0.1, 5),
        position: { lat: 48, lng: 16 },
        addItem,
        firecallId: 'fc1',
        creatorEmail: 'u@x',
        firestoreDb: '',
      });
      await vi.waitFor(() => { expect(start).toHaveBeenCalledTimes(1); });
      expect(start).toHaveBeenCalledWith({
        firecallId: 'fc1',
        layerId: 'l1',
        sampleRate: 'normal',
        deviceLabel: 'RC-102 (SN1)',
        creator: 'u@x',
        firestoreDb: '',
      });
      expect(addItem).not.toHaveBeenCalled();

      unmount();
      await vi.waitFor(() => { expect(stop).toHaveBeenCalledTimes(1); });

      isAvail.mockRestore();
      start.mockRestore();
      stop.mockRestore();
    });
  });
```

**Step 2: Hook-Implementation anpassen**

```ts
// useRadiacodePointRecorder.ts (komplette neue Fassung)
import haversine from 'haversine-distance';
import { useEffect, useRef } from 'react';
import { FcMarker, FirecallItem } from '../../components/firebase/firestore';
import {
  isNativeTrackingAvailable,
  nativeStartTrack,
  nativeStopTrack,
} from '../radiacode/nativeTrackBridge';
import { shouldSamplePoint } from '../radiacode/sampling';
import {
  RATE_CONFIG,
  RadiacodeDeviceRef,
  RadiacodeMeasurement,
  SampleRate,
} from '../radiacode/types';

export interface UseRadiacodePointRecorderParams {
  active: boolean;
  layerId: string;
  sampleRate: SampleRate;
  device: RadiacodeDeviceRef | null;
  measurement: RadiacodeMeasurement | null;
  position: { lat: number; lng: number } | null;
  addItem: (item: FirecallItem) => Promise<{ id: string }>;
  firecallId: string;
  creatorEmail: string;
  firestoreDb?: string;
  onStart?: () => void | Promise<void>;
  onStop?: () => void | Promise<void>;
}

interface LastSample {
  lat: number;
  lng: number;
  time: number;
}

function deviceLabel(device: RadiacodeDeviceRef | null): string {
  if (!device) return 'unknown';
  return `${device.name} (${device.serial})`;
}

export function useRadiacodePointRecorder({
  active,
  layerId,
  sampleRate,
  device,
  measurement,
  position,
  addItem,
  firecallId,
  creatorEmail,
  firestoreDb = '',
  onStart,
  onStop,
}: UseRadiacodePointRecorderParams): void {
  const native = isNativeTrackingAvailable();
  const lastSampleRef = useRef<LastSample | null>(null);
  const writingRef = useRef(false);

  // Native-Pfad: Start/Stop via Foreground-Service. Der Measurement-getriebene
  // Effekt unten bleibt ein No-Op (siehe Early-Return bei `native`).
  useEffect(() => {
    if (!active) return;
    if (native) {
      nativeStartTrack({
        firecallId,
        layerId,
        sampleRate,
        deviceLabel: deviceLabel(device),
        creator: creatorEmail,
        firestoreDb,
      }).catch((err) =>
        console.error('[RADIACODE] nativeStartTrack failed', err),
      );
      return () => {
        nativeStopTrack().catch((err) =>
          console.error('[RADIACODE] nativeStopTrack failed', err),
        );
      };
    }
    // Web-only: bestehendes onStart/onStop-Muster
    Promise.resolve(onStart?.()).catch((err) =>
      console.error('[RADIACODE] onStart failed', err),
    );
    return () => {
      Promise.resolve(onStop?.()).catch((err) =>
        console.error('[RADIACODE] onStop failed', err),
      );
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, native]);

  useEffect(() => {
    if (!active) {
      lastSampleRef.current = null;
      return;
    }
    if (native) return; // native schreibt im Foreground-Service
    if (!measurement || !position) return;
    if (writingRef.current) return;

    const now = Date.now();
    const last = lastSampleRef.current;
    const config = RATE_CONFIG[sampleRate];

    let shouldWrite: boolean;
    if (!last) {
      shouldWrite = true;
    } else {
      const distanceMeters = haversine(
        { lat: last.lat, lng: last.lng },
        { lat: position.lat, lng: position.lng },
      );
      const secondsSinceLast = (now - last.time) / 1000;
      shouldWrite = shouldSamplePoint({
        distanceMeters,
        secondsSinceLast,
        config,
      });
    }

    if (!shouldWrite) return;

    writingRef.current = true;
    const marker: FcMarker = {
      type: 'marker',
      name: `${measurement.dosisleistung.toFixed(3)} µSv/h`,
      layer: layerId,
      lat: position.lat,
      lng: position.lng,
      fieldData: {
        dosisleistung: measurement.dosisleistung,
        cps: measurement.cps,
        device: deviceLabel(device),
      },
    };
    lastSampleRef.current = { lat: position.lat, lng: position.lng, time: now };

    addItem(marker).finally(() => {
      writingRef.current = false;
    });
  }, [active, layerId, sampleRate, device, measurement, position, addItem, native]);
}
```

---

### Task C3: `RecordButton.tsx` anpassen

**Files:**
- Modify: `src/components/Map/RecordButton.tsx`

**Änderung 1**: Imports ergänzen (falls nicht vorhanden — `useFirecallId` wird aus `useFirecall` importiert):

```ts
import { useFirecallId } from '../../hooks/useFirecall';
import useFirebaseLogin from '../../hooks/useFirebaseLogin';
```

**Änderung 2**: In der Komponenten-Funktion Body (nach `const addFirecallItem = useFirecallItemAdd();`):

```ts
  const firecallId = useFirecallId();
  const { email: creatorEmail } = useFirebaseLogin();
  const firestoreDb = process.env.NEXT_PUBLIC_FIRESTORE_DB || '';
```

**Änderung 3**: Im `useRadiacodePointRecorder(...)`-Aufruf die neuen Props ergänzen:

```ts
  useRadiacodePointRecorder({
    active: radiacodeActive,
    layerId: radiacodeLayerId ?? '',
    sampleRate: radiacodeSampleRate,
    device,
    measurement,
    position: isPositionSet ? { lat: position.lat, lng: position.lng } : null,
    addItem: addFirecallItem,
    firecallId: firecallId ?? '',
    creatorEmail: creatorEmail ?? '',
    firestoreDb,
  });
```

**Sanity-Check:** `useFirecallId` gibt typischerweise `string | undefined` zurück. Wenn kein Firecall aktiv ist, ist `radiacodeActive` ohnehin `false`, also schadet ein leerer String nicht.

---

## Phase D — Android-Permissions & Manifest-Check

### Task D1: Manifest-Prüfung (wahrscheinlich No-Op)

**Files:**
- Modify (nur falls nötig): `capacitor/android/app/src/main/AndroidManifest.xml`

**Was prüfen:** `INTERNET`-Permission ist bei Capacitor-Apps per Default vorhanden. Falls `adb logcat` während Smoke-Test `SocketException: Permission denied` zeigt → eintragen. Ansonsten keine Änderung.

Kein separater Code-Step — nur ein Manifest-Blick. Dokumentieren falls Anpassung: „Kein Handlungsbedarf, `INTERNET` ist implizit gegeben."

---

## Phase E — Verifikation + Commit

Laut Projekt-Konvention laufen alle Checks **einmal am Ende** des Plans, nicht pro Task.

### Task E1: Android-Build testen

**Run:**
```bash
cd capacitor/android && ./gradlew :app:compileDebugKotlin :app:compileDebugJavaWithJavac
```

**Expected:** `BUILD SUCCESSFUL`. Falls Gradle-Errors zu Firebase-Klassen → BOM-Version in [build.gradle](../../capacitor/android/app/build.gradle) prüfen.

### Task E2: Kotlin-Unit-Tests

**Run:**
```bash
cd capacitor/android && ./gradlew :app:testDebugUnitTest
```

**Expected:** Alle Tests aus `SampleGateTest`, `HaversineTest`, `TrackRecorderTest` grün.

### Task E3: TypeScript-Checks + Tests

**Run (im Projekt-Root):**
```bash
npx tsc --noEmit
npx eslint
npx vitest run
npx next build --webpack
```

**Expected:** Alle 4 Commands ohne Fehler. TSC-Fehler MÜSSEN gefixt werden (siehe [CLAUDE.md](../../CLAUDE.md)).

### Task E4: Smoke-Test am Gerät

**Vorbedingung:** Android-Gerät mit Radiacode erreichbar, `capacitor run android`.

**Szenarien:**
1. **Foreground**: Track starten → Marker erscheinen in der Karte (Firestore-Listener aktualisiert live). Nach 30 s mehrere Marker sichtbar.
2. **Hintergrund**: App minimieren, 2 Min warten. Zurück in die App → weitere Marker während der 2 Min wurden geschrieben (Firestore-Query, timestamps prüfen).
3. **Display aus**: Gerät sperren, 2 Min warten. Entsperren → Marker im gesperrten Zeitraum vorhanden.
4. **Flugmodus**: Track läuft, Flugmodus an für 1 Min, aus. Marker erscheinen retrospektiv (Firestore-Queue-Flush).
5. **Track-Stop**: Track stoppen → keine neuen Marker trotz weiter laufender BLE-Session. Live-Werte (Dosimetrie) bleiben sichtbar.

Jedes Szenario kurz dokumentieren (OK / Fehlerbild). Falls Fehler → Bug fixen, Check-Suite erneut laufen lassen.

### Task E5: Commit + Push

**Run (aus Projekt-Root):**
```bash
git checkout -- next-env.d.ts
git add capacitor/android/app/build.gradle \
        capacitor/android/app/src/main/java/at/ffnd/einsatzkarte/ \
        capacitor/android/app/src/test/java/at/ffnd/einsatzkarte/ \
        src/hooks/radiacode/nativeTrackBridge.ts \
        src/hooks/radiacode/nativeTrackBridge.test.ts \
        src/hooks/recording/useRadiacodePointRecorder.ts \
        src/hooks/recording/useRadiacodePointRecorder.test.tsx \
        src/components/Map/RecordButton.tsx
git commit -m "feat(radiacode): native firestore-writer für track-marker"
```

**Commit-Message-Body** (via Heredoc):

```
feat(radiacode): native firestore-writer für track-marker

Auf Android schreibt der Foreground-Service Radiacode-Track-Marker jetzt
direkt via natives Firebase-Firestore-SDK, unabhängig vom WebView-Zustand.
Damit gehen keine Messungen mehr verloren, wenn App im Hintergrund oder
Display aus ist. Offline-Persistenz via Firestore-SDK-Default.

- Neue Kotlin-Komponenten (track/): SampleGate, Haversine, TrackConfig,
  TrackRecorder, FirestoreMarkerWriter + JUnit-Tests.
- Service-Actions ACTION_START_TRACK / ACTION_STOP_TRACK; LocationCallback
  speichert lastLocation für den Recorder.
- Plugin-Methoden startTrackRecording / stopTrackRecording + markerWritten-Event.
- TS-Bridge nativeTrackBridge.ts; useRadiacodePointRecorder routet auf
  Android via Bridge, im Web bleibt der JS-Pfad unverändert.
- DB-Auswahl (dev/prod) via EXTRA_FIRESTORE_DB aus NEXT_PUBLIC_FIRESTORE_DB.

Siehe docs/plans/2026-04-22-radiacode-native-firestore-design.md
```

Kein Push in diesem Schritt — das kommt separat nach Review.

---

## Risiken & Gegenmaßnahmen

| Risiko | Gegenmaßnahme |
|---|---|
| Firebase-Auth-State zwischen Capacitor-Plugin und nativem Firestore-SDK ist entkoppelt | `@capacitor-firebase/authentication` synchronisiert beide Ebenen automatisch. Smoke-Test E4.2 deckt das ab. Falls Write an Rules scheitert → Plugin-Version in `package.json` prüfen. |
| `FirebaseFirestore.getInstance(dbName)` nicht in BOM 33.3.0 | BOM enthält Firestore 25.1.x — Methode ist verfügbar seit 25.1.0. Falls doch ein Build-Error: explizit `firebase-firestore:25.1.2` pinnen. |
| Zwei Mehrfach-Registrierungen desselben Capacitor-Plugins (`RadiacodeNotification`) in TS | Capacitor erlaubt mehrere `registerPlugin`-Aufrufe desselben Plugin-Namens; alle liefern die identische Proxy-Instanz. Kein Problem. |
| `useEffect`-Cleanup beim Hook-Unmount schickt `nativeStopTrack`, Track wurde aber nie gestartet | `nativeStopTrack` ist idempotent (Service ignoriert `ACTION_STOP_TRACK` wenn kein Recorder aktiv). Harmlos. |
| Audit-Log wird nicht mehr pro Marker geschrieben | Bewusst in Design festgelegt (Begründung: hunderte Einträge pro Track). Wenn der User später ein Track-Summary will, folgt ein separater Task. |

---

## Abhängigkeiten & Reihenfolge

Phase A ist in sich geschlossen und JVM-pur → zuerst.
Phase B braucht A (`TrackRecorder`, `SampleRateConfig`, `LatLng`). B2 braucht B1 (Firebase-Dep).
Phase C ist komplett unabhängig von A/B (JS-Code ruft nur Plugin-Namen auf) — kann parallel zu B laufen, wird aber hier sequenziell erwartet, damit ein einzelner Commit alles zusammen hat.
Phase D (Manifest) ist i.d.R. No-Op.
Phase E verifiziert alles gemeinsam.

---

## Nicht-Ziele (Erinnerung)

- Spektrum-Snapshots nativ schreiben
- GPS-Line-Recorder nativ
- Konkrete UI-Nutzung des `markerWritten`-Events (Infrastruktur ist da, Nutzung folgt bei Bedarf)
- Audit-Summary-Eintrag beim Track-Ende
