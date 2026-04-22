# Native GPS-Track-Aufzeichnung — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task.

**Goal:** Klassische GPS-Track-Aufzeichnung (ohne Radiacode) im Android-Native-Build läuft im Standby/bei gesperrtem Bildschirm weiter; Sampling unterstützt zusätzlich einen Custom-Modus mit user-definierten Schwellwerten (Zeit, Abstand, Dosisleistungs-Delta).

**Architecture:** Der bestehende `RadiacodeForegroundService` wird semantisch erweitert und hostet zwei unabhängig startbare Sessions (BLE, GPS-Track). Ein neues `gpstrack/`-Modul in Kotlin schreibt Positionen in das bestehende `Line`-Firecall-Item (TS legt es an → Service hängt Punkte an). Die bestehende `SampleGate`/`SampleRate`-Logik wird um eine `Custom`-Variante erweitert und vereinheitlicht (OR-Logik mit 1 s-Floor). Die Custom-Option landet als viertes Radio in `TrackStartDialog`.

**Tech Stack:** Kotlin (AGP/Gradle, JUnit4), TypeScript/React 19, Vitest, Capacitor (Android), Firebase Firestore (Kotlin + JS SDK), MUI v7.

**Konventionen aus CLAUDE.md:**

- Tests liegen **direkt neben** der Quelle (`foo.ts` → `foo.test.ts`), keine `__tests__/`-Ordner.
- **Conventional Commits** (`feat:`, `fix:`, `test:`, `refactor:`, `docs:`).
- **TSC-Fehler sind niemals zu ignorieren.** Auch "vorbestehende" müssen gelöst werden.
- **Lean-Plan-Präferenz:** **keine** Zwischen-Commits innerhalb einer Task, **keine** `tsc/lint/build`-Checks zwischen Tasks. Pro Task am Ende **ein** Commit. Die volle Check-Matrix (`tsc`, `eslint`, `vitest`, `next build`) wird **nur** in Task 11 am Ende ausgeführt.

**Design-Doc:** `docs/plans/2026-04-22-native-gps-track-design.md` — vor jeder Task lesen.

---

## Task 1: Kotlin — `SampleRate`-Sealed-Class + erweiterte Gate-Logik

**Ziel:** `SampleGate` so erweitern, dass Presets und ein `Custom`-Modus mit OR-Logik über Zeit/Distanz/Dose-Delta unterstützt werden. Bestehendes `SampleRateConfig` bleibt als reine Daten-Klasse erhalten, damit bestehende Call-Sites nicht brechen.

**Files:**

- Modify: `capacitor/android/app/src/main/java/at/ffnd/einsatzkarte/radiacode/track/SampleGate.kt`
- Modify: `capacitor/android/app/src/test/java/at/ffnd/einsatzkarte/radiacode/track/SampleGateTest.kt`

**Step 1: Failing Tests schreiben**

In `SampleGateTest.kt` ergänzen (bestehende Preset-Tests unverändert lassen):

```kotlin
// Presets → sealed-class-Konversion
@Test fun `presets mapping`() {
    assertEquals(SampleRate.Niedrig, SampleRate.fromString("niedrig"))
    assertEquals(SampleRate.Normal,  SampleRate.fromString("normal"))
    assertEquals(SampleRate.Hoch,    SampleRate.fromString("hoch"))
}

@Test fun `custom only interval triggers on max interval`() {
    val rate = SampleRate.Custom(maxIntervalSec = 10.0, minDistanceMeters = null, minDoseRateDeltaUSvH = null)
    assertFalse(SampleGate.shouldSample(distanceM = 100.0, dtSec = 5.0, doseRateDeltaUSvH = null, rate = rate))
    assertTrue (SampleGate.shouldSample(distanceM = 0.0,   dtSec = 10.0, doseRateDeltaUSvH = null, rate = rate))
}

@Test fun `custom only distance triggers on distance`() {
    val rate = SampleRate.Custom(maxIntervalSec = null, minDistanceMeters = 5.0, minDoseRateDeltaUSvH = null)
    assertFalse(SampleGate.shouldSample(distanceM = 4.9, dtSec = 3600.0, doseRateDeltaUSvH = null, rate = rate))
    assertTrue (SampleGate.shouldSample(distanceM = 5.0, dtSec = 2.0,   doseRateDeltaUSvH = null, rate = rate))
}

@Test fun `custom only dose delta triggers on abs delta`() {
    val rate = SampleRate.Custom(maxIntervalSec = null, minDistanceMeters = null, minDoseRateDeltaUSvH = 0.1)
    assertFalse(SampleGate.shouldSample(0.0, 5.0, doseRateDeltaUSvH = 0.05, rate = rate))
    assertTrue (SampleGate.shouldSample(0.0, 5.0, doseRateDeltaUSvH = -0.2, rate = rate))
}

@Test fun `custom hard 1s floor applies`() {
    val rate = SampleRate.Custom(0.0, 0.0, 0.0) // alle "triggern immer"
    assertFalse(SampleGate.shouldSample(100.0, 0.5, 1.0, rate = rate))
    assertTrue (SampleGate.shouldSample(100.0, 1.0, 1.0, rate = rate))
}

@Test fun `custom all null never samples`() {
    val rate = SampleRate.Custom(null, null, null)
    assertFalse(SampleGate.shouldSample(100.0, 60.0, 10.0, rate = rate))
}

@Test fun `presets via new API behave like config-based API`() {
    // Normal preset: dist>=5 or dt>=15, floor 1s
    val rate = SampleRate.Normal
    assertFalse(SampleGate.shouldSample(4.9, 2.0, null, rate))
    assertTrue (SampleGate.shouldSample(5.0, 2.0, null, rate))
    assertTrue (SampleGate.shouldSample(0.0, 15.0, null, rate))
    assertFalse(SampleGate.shouldSample(100.0, 0.5, null, rate))
}
```

Die bestehenden Tests gegen `SampleRateConfig` bleiben unverändert — die alte
`SampleGate.shouldSample(distance, dt, config)`-Signatur bleibt als dünner Wrapper
erhalten (oder ruft intern in den neuen Pfad), damit bestehende Call-Sites nicht
brechen.

**Step 2: Tests laufen → scheitern erwartet**

Run: `cd capacitor/android && ./gradlew :app:testDebugUnitTest --tests "at.ffnd.einsatzkarte.radiacode.track.SampleGateTest"`

Expected: Kompilierfehler / FAIL, weil `SampleRate` noch nicht existiert.

**Step 3: Implementation**

`SampleGate.kt` ersetzen durch:

```kotlin
package at.ffnd.einsatzkarte.radiacode.track

import kotlin.math.abs

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

sealed class SampleRate {
    data object Niedrig : SampleRate()
    data object Normal  : SampleRate()
    data object Hoch    : SampleRate()
    data class Custom(
        val maxIntervalSec: Double?,
        val minDistanceMeters: Double?,
        val minDoseRateDeltaUSvH: Double?,
    ) : SampleRate()

    companion object {
        fun fromString(s: String): SampleRate = when (s) {
            "niedrig" -> Niedrig
            "normal"  -> Normal
            "hoch"    -> Hoch
            else      -> throw IllegalArgumentException("Unknown sample rate: $s")
        }
    }
}

object SampleGate {
    private const val HARD_FLOOR_SEC = 1.0

    /** Legacy API — ruft intern in den neuen Pfad. */
    fun shouldSample(distanceMeters: Double, secondsSinceLast: Double, config: SampleRateConfig): Boolean {
        if (secondsSinceLast < config.minIntervalSec) return false
        if (secondsSinceLast >= config.maxIntervalSec) return true
        return distanceMeters >= config.minDistanceMeters
    }

    fun shouldSample(
        distanceM: Double,
        dtSec: Double,
        doseRateDeltaUSvH: Double?,
        rate: SampleRate,
    ): Boolean {
        if (dtSec < HARD_FLOOR_SEC) return false
        val c = when (rate) {
            SampleRate.Niedrig -> SampleRate.Custom(30.0, 10.0, null)
            SampleRate.Normal  -> SampleRate.Custom(15.0,  5.0, null)
            SampleRate.Hoch    -> SampleRate.Custom( 5.0,  2.0, null)
            is SampleRate.Custom -> rate
        }
        c.maxIntervalSec?.let { if (dtSec >= it) return true }
        c.minDistanceMeters?.let { if (distanceM >= it) return true }
        c.minDoseRateDeltaUSvH?.let { schwelle ->
            if (doseRateDeltaUSvH != null && abs(doseRateDeltaUSvH) >= schwelle) return true
        }
        return false
    }
}
```

**Step 4: Tests laufen → passing erwartet**

Run: `cd capacitor/android && ./gradlew :app:testDebugUnitTest --tests "at.ffnd.einsatzkarte.radiacode.track.SampleGateTest"`

Expected: PASS (bestehende + neue).

**Step 5: Commit**

```bash
git add capacitor/android/app/src/main/java/at/ffnd/einsatzkarte/radiacode/track/SampleGate.kt \
        capacitor/android/app/src/test/java/at/ffnd/einsatzkarte/radiacode/track/SampleGateTest.kt
git commit -m "feat(gpstrack): sealed SampleRate + custom-mode OR-gate in SampleGate"
```

---

## Task 2: Kotlin — Neues `gpstrack`-Modul (`GpsTrackConfig` + `GpsTrackRecorder`)

**Ziel:** Nativer Recorder, der GPS-Fixes per `SampleGate` gated durch einen
`LineUpdater` in Firestore anhängt. Der Recorder selbst ist stateless gegenüber
Firestore; das Schreiben macht der injizierte `LineUpdater`.

**Files:**

- Create: `capacitor/android/app/src/main/java/at/ffnd/einsatzkarte/gpstrack/GpsTrackConfig.kt`
- Create: `capacitor/android/app/src/main/java/at/ffnd/einsatzkarte/gpstrack/LineUpdater.kt`
- Create: `capacitor/android/app/src/main/java/at/ffnd/einsatzkarte/gpstrack/GpsTrackRecorder.kt`
- Create: `capacitor/android/app/src/test/java/at/ffnd/einsatzkarte/gpstrack/GpsTrackRecorderTest.kt`

**Step 1: Failing Tests**

`GpsTrackRecorderTest.kt`:

```kotlin
package at.ffnd.einsatzkarte.gpstrack

import at.ffnd.einsatzkarte.radiacode.track.SampleRate
import org.junit.Assert.*
import org.junit.Test

private class FakeLineUpdater : LineUpdater {
    data class Appended(val lineId: String, val lat: Double, val lng: Double, val ts: Long)
    val writes = mutableListOf<Appended>()
    override fun append(lineId: String, lat: Double, lng: Double, ts: Long,
                        onSuccess: () -> Unit, onFailure: (Throwable) -> Unit) {
        writes += Appended(lineId, lat, lng, ts)
        onSuccess()
    }
}

class GpsTrackRecorderTest {
    private val baseConfig = GpsTrackConfig(
        firecallId = "fc", lineId = "line1",
        sampleRate = SampleRate.Normal,
        firestoreDb = "", creator = "me",
    )

    @Test fun `first fix writes immediately`() {
        val w = FakeLineUpdater()
        var now = 0L
        val rec = GpsTrackRecorder(baseConfig, w, nowMs = { now })
        rec.onLocation(47.0, 16.0)
        assertEquals(1, w.writes.size)
        assertEquals(47.0, w.writes[0].lat, 1e-9)
    }

    @Test fun `second fix gated by sample rate`() {
        val w = FakeLineUpdater()
        var now = 0L
        val rec = GpsTrackRecorder(baseConfig, w, nowMs = { now })
        rec.onLocation(47.0, 16.0); now += 500L
        rec.onLocation(47.00001, 16.00001) // <<5m, <<1s
        assertEquals(1, w.writes.size)
        now += 20_000L
        rec.onLocation(47.00001, 16.00001) // time > maxInterval
        assertEquals(2, w.writes.size)
    }

    @Test fun `stop prevents further writes`() {
        val w = FakeLineUpdater()
        var now = 0L
        val rec = GpsTrackRecorder(baseConfig, w, nowMs = { now })
        rec.onLocation(47.0, 16.0)
        rec.stop()
        now += 100_000L
        rec.onLocation(48.0, 17.0)
        assertEquals(1, w.writes.size)
    }
}
```

**Step 2: Run, expect FAIL**

Run: `cd capacitor/android && ./gradlew :app:testDebugUnitTest --tests "at.ffnd.einsatzkarte.gpstrack.*"`

Expected: FAIL (classes not found).

**Step 3: Implementation**

`GpsTrackConfig.kt`:

```kotlin
package at.ffnd.einsatzkarte.gpstrack

import at.ffnd.einsatzkarte.radiacode.track.SampleRate

data class GpsTrackConfig(
    val firecallId: String,
    val lineId: String,
    val sampleRate: SampleRate,
    val firestoreDb: String,
    val creator: String,
)
```

`LineUpdater.kt`:

```kotlin
package at.ffnd.einsatzkarte.gpstrack

interface LineUpdater {
    fun append(
        lineId: String,
        lat: Double,
        lng: Double,
        ts: Long,
        onSuccess: () -> Unit = {},
        onFailure: (Throwable) -> Unit = {},
    )
}
```

`GpsTrackRecorder.kt`:

```kotlin
package at.ffnd.einsatzkarte.gpstrack

import at.ffnd.einsatzkarte.radiacode.track.Haversine
import at.ffnd.einsatzkarte.radiacode.track.SampleGate

class GpsTrackRecorder(
    private val config: GpsTrackConfig,
    private val updater: LineUpdater,
    private val nowMs: () -> Long = System::currentTimeMillis,
) {
    private data class Last(val lat: Double, val lng: Double, val time: Long)
    @Volatile private var last: Last? = null
    @Volatile private var stopped = false

    fun onLocation(lat: Double, lng: Double) {
        if (stopped) return
        val now = nowMs()
        val l = last
        val shouldWrite = if (l == null) {
            true
        } else {
            val dist = Haversine.distanceMeters(l.lat, l.lng, lat, lng)
            val dt = (now - l.time) / 1000.0
            SampleGate.shouldSample(dist, dt, doseRateDeltaUSvH = null, rate = config.sampleRate)
        }
        if (!shouldWrite) return
        last = Last(lat, lng, now)
        updater.append(config.lineId, lat, lng, now)
    }

    fun stop() { stopped = true }
}
```

**Step 4: Run tests → PASS**

**Step 5: Commit**

```bash
git add capacitor/android/app/src/main/java/at/ffnd/einsatzkarte/gpstrack/ \
        capacitor/android/app/src/test/java/at/ffnd/einsatzkarte/gpstrack/
git commit -m "feat(gpstrack): GpsTrackRecorder + LineUpdater interface"
```

---

## Task 3: Kotlin — `FirestoreLineUpdater`

**Ziel:** Concrete `LineUpdater`, der das `Line`-Firestore-Dokument liest und das
`positions`-JSON erweitert. Offline-Retry übernimmt die Firestore-SDK-Queue.

**Files:**

- Create: `capacitor/android/app/src/main/java/at/ffnd/einsatzkarte/gpstrack/FirestoreLineUpdater.kt`
- Create: `capacitor/android/app/src/test/java/at/ffnd/einsatzkarte/gpstrack/FirestoreLineUpdaterTest.kt`

**Step 1: Failing Tests**

`FirestoreLineUpdater` arbeitet direkt mit `FirebaseFirestore` — das ist in
JVM-Unit-Tests nicht trivial mockbar. Wir testen nur die reine Logik des
JSON-Append + Distance-Berechnung über eine interne `LineUpdate.compute()`-Funktion
(pure Kotlin) und verifizieren die Firestore-Integration manuell beim Smoke-Test.

`FirestoreLineUpdaterTest.kt`:

```kotlin
package at.ffnd.einsatzkarte.gpstrack

import org.junit.Assert.*
import org.junit.Test

class FirestoreLineUpdaterTest {
    @Test fun `appendPositions on empty positions initializes array`() {
        val upd = LineUpdate.compute(
            existingPositionsJson = null,
            lat = 47.0, lng = 16.0,
        )
        assertEquals("[[47.0,16.0]]", upd.positionsJson)
        assertEquals(47.0, upd.destLat, 1e-9)
        assertEquals(16.0, upd.destLng, 1e-9)
        assertEquals(0.0, upd.distance, 1e-6)
    }

    @Test fun `appendPositions accumulates distance`() {
        val first = LineUpdate.compute(null, 47.0, 16.0)
        val second = LineUpdate.compute(first.positionsJson, 47.001, 16.0)
        // ~ 111 m pro 0.001 lat
        assertTrue("got ${second.distance}", second.distance in 100.0..115.0)
        assertTrue(second.positionsJson.startsWith("[[47.0,16.0]"))
    }

    @Test fun `appendPositions tolerates malformed existing json`() {
        val upd = LineUpdate.compute(
            existingPositionsJson = "this is not json",
            lat = 47.0, lng = 16.0,
        )
        assertEquals("[[47.0,16.0]]", upd.positionsJson)
    }
}
```

**Step 2: Run, FAIL**

**Step 3: Implementation**

`FirestoreLineUpdater.kt`:

```kotlin
package at.ffnd.einsatzkarte.gpstrack

import android.util.Log
import at.ffnd.einsatzkarte.radiacode.track.Haversine
import com.google.firebase.firestore.FirebaseFirestore
import org.json.JSONArray

data class LineUpdate(
    val positionsJson: String,
    val destLat: Double,
    val destLng: Double,
    val distance: Double,
) {
    companion object {
        fun compute(existingPositionsJson: String?, lat: Double, lng: Double): LineUpdate {
            val points = mutableListOf<DoubleArray>()
            if (!existingPositionsJson.isNullOrBlank()) {
                try {
                    val arr = JSONArray(existingPositionsJson)
                    for (i in 0 until arr.length()) {
                        val p = arr.getJSONArray(i)
                        points += doubleArrayOf(p.getDouble(0), p.getDouble(1))
                    }
                } catch (_: Throwable) {
                    // fall through — treat as empty
                }
            }
            points += doubleArrayOf(lat, lng)
            var dist = 0.0
            for (i in 1 until points.size) {
                dist += Haversine.distanceMeters(
                    points[i - 1][0], points[i - 1][1],
                    points[i][0], points[i][1],
                )
            }
            val json = buildString {
                append('[')
                for ((i, p) in points.withIndex()) {
                    if (i > 0) append(',')
                    append('[').append(p[0]).append(',').append(p[1]).append(']')
                }
                append(']')
            }
            return LineUpdate(json, lat, lng, dist)
        }
    }
}

class FirestoreLineUpdater(dbName: String) : LineUpdater {
    companion object { private const val TAG = "GpsTrack" }

    private val firestore: FirebaseFirestore = if (dbName.isBlank())
        FirebaseFirestore.getInstance()
    else
        FirebaseFirestore.getInstance(dbName)

    override fun append(
        lineId: String, lat: Double, lng: Double, ts: Long,
        onSuccess: () -> Unit, onFailure: (Throwable) -> Unit,
    ) {
        // Line-Items liegen als items der Firecall, nicht top-level. Der Caller muss
        // die firecallId mitgeben, damit der Pfad vollständig ist.
        Log.w(TAG, "append without firecallId path — use append(firecallId,...)")
    }

    fun append(
        firecallId: String,
        lineId: String, lat: Double, lng: Double, ts: Long,
        onSuccess: () -> Unit = {}, onFailure: (Throwable) -> Unit = {},
    ) {
        val doc = firestore.collection("call").document(firecallId)
            .collection("item").document(lineId)
        doc.get()
            .addOnSuccessListener { snap ->
                val existing = snap.getString("positions")
                val upd = LineUpdate.compute(existing, lat, lng)
                val patch = linkedMapOf<String, Any>(
                    "positions" to upd.positionsJson,
                    "destLat" to upd.destLat,
                    "destLng" to upd.destLng,
                    "distance" to upd.distance,
                )
                doc.update(patch)
                    .addOnSuccessListener { onSuccess() }
                    .addOnFailureListener { err -> Log.w(TAG, "line update failed", err); onFailure(err) }
            }
            .addOnFailureListener { err -> Log.w(TAG, "line read failed", err); onFailure(err) }
    }
}
```

Das `LineUpdater`-Interface bekommt eine Default-Implementation mit `firecallId`.
Damit `GpsTrackRecorder.append(lineId, ...)` den Pfad korrekt aufruft, passen wir
**die Interface-Signatur** direkt an und entfernen das `firecallId`-Log-Noise:

```kotlin
// LineUpdater.kt überarbeitet:
interface LineUpdater {
    fun append(
        firecallId: String, lineId: String,
        lat: Double, lng: Double, ts: Long,
        onSuccess: () -> Unit = {}, onFailure: (Throwable) -> Unit = {},
    )
}
```

…und im `GpsTrackRecorder.onLocation`:

```kotlin
updater.append(config.firecallId, config.lineId, lat, lng, now)
```

Tests in Task 2 vorgreifend mit `firecallId`-Parameter anpassen — der Recorder-Test
nutzt schon `baseConfig.firecallId = "fc"`. Im Fake-Updater dann
`append(firecallId, lineId, ...)` registrieren.

> **Hinweis:** Diese Korrektur macht Task 2's Fake-`LineUpdater` leicht anders —
> beim Ausführen von Task 3 den Fake und Recorder-Call mit anpassen, **in einer
> Task-Range** (hier Task 2 + 3) erledigen.

**Step 4: Tests PASS**

**Step 5: Commit**

```bash
git add capacitor/android/app/src/main/java/at/ffnd/einsatzkarte/gpstrack/ \
        capacitor/android/app/src/test/java/at/ffnd/einsatzkarte/gpstrack/
git commit -m "feat(gpstrack): FirestoreLineUpdater with JSON-append logic"
```

---

## Task 4: Kotlin — `TrackRecorder` (Radiacode) um Custom + Dose-Delta erweitern

**Ziel:** Der bestehende `TrackRecorder` (Radiacode-Marker) muss beim Custom-Modus
die Dosisleistung des letzten geschriebenen Samples merken und als Delta an
`SampleGate.shouldSample(..., doseRateDelta, rate)` durchreichen. Die
`TrackConfig.sampleRate` wechselt von `SampleRateConfig` auf `SampleRate`
(sealed class).

**Files:**

- Modify: `capacitor/android/app/src/main/java/at/ffnd/einsatzkarte/radiacode/track/TrackConfig.kt`
- Modify: `capacitor/android/app/src/main/java/at/ffnd/einsatzkarte/radiacode/track/TrackRecorder.kt`
- Modify: `capacitor/android/app/src/test/java/at/ffnd/einsatzkarte/radiacode/track/TrackRecorderTest.kt`
- Modify (Call-Site): `capacitor/android/app/src/main/java/at/ffnd/einsatzkarte/RadiacodeForegroundService.kt` — nur der Aufruf `SampleRateConfig.of(rate)` wird zu `SampleRate.fromString(rate)`.

**Step 1: Failing Tests**

Bestehende Tests in `TrackRecorderTest.kt`: `TrackConfig.sampleRate` von
`SampleRateConfig.of("normal")` auf `SampleRate.Normal` umstellen. Neu:

```kotlin
@Test fun `custom with dose delta writes when dose changes enough`() {
    val writer = FakeMarkerWriter()
    var now = 0L
    val rec = TrackRecorder(
        config = TrackConfig(
            firecallId = "fc", layerId = "l1",
            sampleRate = SampleRate.Custom(
                maxIntervalSec = 3600.0,   // lange → nur dose zählt
                minDistanceMeters = 10_000.0, // gross → nur dose zählt
                minDoseRateDeltaUSvH = 0.1,
            ),
            deviceLabel = "dev", creator = "me", firestoreDb = "",
        ),
        writer = writer, nowMs = { now },
    )
    val loc = LatLng(47.0, 16.0)
    rec.onMeasurement(measurement(dose = 0.05), loc); now += 2_000
    rec.onMeasurement(measurement(dose = 0.08), loc); now += 2_000   // delta 0.03 < 0.1 → skip
    assertEquals(1, writer.count)
    rec.onMeasurement(measurement(dose = 0.20), loc)                 // delta 0.15 >= 0.1 → write
    assertEquals(2, writer.count)
}
```

(Hilfsfunktion `measurement(dose = …)` nutzt die bestehende `Measurement`-Factory
aus den vorhandenen Tests — dort kopieren/anpassen.)

**Step 2: Run → FAIL** (Konstruktortyp mismatch / neue Test fehlt).

**Step 3: Implementation**

`TrackConfig.kt`:

```kotlin
data class TrackConfig(
    val firecallId: String,
    val layerId: String,
    val sampleRate: SampleRate,
    val deviceLabel: String,
    val creator: String,
    val firestoreDb: String,
)
```

`TrackRecorder.kt` — Merkt `lastDoseUSvH` am letzten geschriebenen Sample, reicht
das Delta durch:

```kotlin
class TrackRecorder(
    private val config: TrackConfig,
    private val writer: MarkerWriter,
    private val nowMs: () -> Long = System::currentTimeMillis,
    private val onWriteSuccess: (MarkerWriteResult) -> Unit = {},
) {
    private data class LastSample(val lat: Double, val lng: Double, val time: Long, val doseUSvH: Double)

    @Volatile private var last: LastSample? = null
    @Volatile private var stopped = false

    fun onMeasurement(measurement: Measurement, loc: LatLng?) {
        if (stopped || loc == null) return
        val now = nowMs()
        val l = last
        val shouldWrite = if (l == null) {
            true
        } else {
            val distance = Haversine.distanceMeters(l.lat, l.lng, loc.lat, loc.lng)
            val dt = (now - l.time) / 1000.0
            val doseDelta = measurement.dosisleistungUSvH - l.doseUSvH
            SampleGate.shouldSample(distance, dt, doseDelta, config.sampleRate)
        }
        if (!shouldWrite) return
        last = LastSample(loc.lat, loc.lng, now, measurement.dosisleistungUSvH)
        writer.write(
            config = config, measurement = measurement, lat = loc.lat, lng = loc.lng,
            onSuccess = { onWriteSuccess(it) },
            onFailure = { err -> android.util.Log.w("RadiacodeTrack", "marker write failed", err) },
        )
    }

    fun stop() { stopped = true }
}
```

`RadiacodeForegroundService.kt` — einziger Call-Site-Fix: `SampleRateConfig.of(rate)` → `SampleRate.fromString(rate)`. Diese Action behandelt nur Presets. Custom kommt via anderer Extras → siehe Task 5.

**Step 4: Tests PASS**

**Step 5: Commit**

```bash
git add capacitor/android/app/src/main/java/at/ffnd/einsatzkarte/radiacode/track/TrackConfig.kt \
        capacitor/android/app/src/main/java/at/ffnd/einsatzkarte/radiacode/track/TrackRecorder.kt \
        capacitor/android/app/src/test/java/at/ffnd/einsatzkarte/radiacode/track/TrackRecorderTest.kt \
        capacitor/android/app/src/main/java/at/ffnd/einsatzkarte/RadiacodeForegroundService.kt
git commit -m "feat(gpstrack): radiacode TrackRecorder delta-dose gate via sealed SampleRate"
```

---

## Task 5: Kotlin — Service + Plugin-Wiring (GPS-Track-Action, Plugin-Methoden)

**Ziel:** Service kann eigenständig (ohne BLE) eine GPS-Track-Session halten. Plugin
bekommt `startGpsTrack`/`stopGpsTrack` und die Radiacode-`startTrackRecording` wird
so erweitert, dass Custom-Extras akzeptiert werden.

**Files:**

- Modify: `capacitor/android/app/src/main/java/at/ffnd/einsatzkarte/RadiacodeForegroundService.kt`
- Modify: `capacitor/android/app/src/main/java/at/ffnd/einsatzkarte/RadiacodeNotificationPlugin.java`

**Keine Unit-Tests** für diese Task (Android-Service + Plugin sind integration-only) — der manuelle Smoke-Test in Task 11 deckt den Pfad.

**Implementation**

### `RadiacodeForegroundService.kt`

Zusätzliche Konstanten:

```kotlin
const val ACTION_START_GPS_TRACK = "at.ffnd.einsatzkarte.GPS_TRACK_START"
const val ACTION_STOP_GPS_TRACK  = "at.ffnd.einsatzkarte.GPS_TRACK_STOP"

const val EXTRA_LINE_ID            = "lineId"
const val EXTRA_SAMPLE_RATE_KIND   = "sampleRateKind"     // niedrig|normal|hoch|custom
const val EXTRA_CUSTOM_INTERVAL    = "customIntervalSec"  // double; missing = null
const val EXTRA_CUSTOM_DISTANCE    = "customDistanceM"    // double; missing = null
const val EXTRA_CUSTOM_DOSE_DELTA  = "customDoseRateDeltaUSvH" // double; missing = null
const val EXTRA_INITIAL_LAT        = "initialLat"
const val EXTRA_INITIAL_LNG        = "initialLng"
```

Zusätzliches Feld neben `trackRecorder`:

```kotlin
@Volatile private var gpsTrackRecorder: at.ffnd.einsatzkarte.gpstrack.GpsTrackRecorder? = null
```

Hilfsfunktion zum Parsen:

```kotlin
private fun parseSampleRate(intent: Intent): at.ffnd.einsatzkarte.radiacode.track.SampleRate {
    val kind = intent.getStringExtra(EXTRA_SAMPLE_RATE_KIND) ?: "normal"
    if (kind != "custom") return at.ffnd.einsatzkarte.radiacode.track.SampleRate.fromString(kind)
    fun dbl(name: String): Double? =
        if (intent.hasExtra(name)) intent.getDoubleExtra(name, Double.NaN).takeIf { !it.isNaN() }
        else null
    return at.ffnd.einsatzkarte.radiacode.track.SampleRate.Custom(
        maxIntervalSec       = dbl(EXTRA_CUSTOM_INTERVAL),
        minDistanceMeters    = dbl(EXTRA_CUSTOM_DISTANCE),
        minDoseRateDeltaUSvH = dbl(EXTRA_CUSTOM_DOSE_DELTA),
    )
}
```

In `onStartCommand` zwei neue Branches im `when (action)`:

```kotlin
ACTION_START_GPS_TRACK -> {
    val firecallId = intent.getStringExtra(EXTRA_FIRECALL_ID)
    val lineId     = intent.getStringExtra(EXTRA_LINE_ID)
    val firestoreDb = intent.getStringExtra(EXTRA_FIRESTORE_DB) ?: ""
    val creator     = intent.getStringExtra(EXTRA_CREATOR) ?: ""
    if (firecallId.isNullOrBlank() || lineId.isNullOrBlank()) {
        Log.w(TAG, "ACTION_START_GPS_TRACK rejected — missing extras")
    } else {
        val rate = parseSampleRate(intent)
        val cfg = at.ffnd.einsatzkarte.gpstrack.GpsTrackConfig(
            firecallId = firecallId, lineId = lineId,
            sampleRate = rate, firestoreDb = firestoreDb, creator = creator,
        )
        gpsTrackRecorder?.stop()
        gpsTrackRecorder = at.ffnd.einsatzkarte.gpstrack.GpsTrackRecorder(
            cfg,
            object : at.ffnd.einsatzkarte.gpstrack.LineUpdater {
                private val fs = at.ffnd.einsatzkarte.gpstrack.FirestoreLineUpdater(firestoreDb)
                override fun append(
                    firecallId: String, lineId: String, lat: Double, lng: Double, ts: Long,
                    onSuccess: () -> Unit, onFailure: (Throwable) -> Unit,
                ) = fs.append(firecallId, lineId, lat, lng, ts, onSuccess, onFailure)
            },
        )
        acquireWakeLock()
        startHighAccuracyLocation()
        // Initialen Fix, falls vom UI übergeben: direkt einspeisen
        val initLat = if (intent.hasExtra(EXTRA_INITIAL_LAT)) intent.getDoubleExtra(EXTRA_INITIAL_LAT, Double.NaN) else Double.NaN
        val initLng = if (intent.hasExtra(EXTRA_INITIAL_LNG)) intent.getDoubleExtra(EXTRA_INITIAL_LNG, Double.NaN) else Double.NaN
        if (!initLat.isNaN() && !initLng.isNaN()) {
            gpsTrackRecorder?.onLocation(initLat, initLng)
        }
        updateNotificationForState()
        Log.i(TAG, "GPS track started firecall=$firecallId line=$lineId rate=$rate")
    }
}
ACTION_STOP_GPS_TRACK -> {
    Log.i(TAG, "GPS track stop")
    gpsTrackRecorder?.stop()
    gpsTrackRecorder = null
    if (session == null) {
        // keine BLE-Session → Location aus + Service beenden
        stopHighAccuracyLocation()
        releaseWakeLock()
        stopForeground(STOP_FOREGROUND_REMOVE)
        stopSelf()
    } else {
        updateNotificationForState()
    }
}
```

Im `LocationCallback` zusätzlich füttern:

```kotlin
override fun onLocationResult(result: LocationResult) {
    result.lastLocation?.let { loc ->
        lastLocation = loc
        gpsTrackRecorder?.onLocation(loc.latitude, loc.longitude)
    }
}
```

`onTaskRemoved`:

```kotlin
override fun onTaskRemoved(rootIntent: Intent?) {
    Log.w(TAG, "onTaskRemoved — app swiped away")
    if (gpsTrackRecorder != null) {
        Log.i(TAG, "onTaskRemoved — stopping GPS track (user swiped)")
        gpsTrackRecorder?.stop()
        gpsTrackRecorder = null
        if (session == null) {
            stopHighAccuracyLocation()
            releaseWakeLock()
            stopForeground(STOP_FOREGROUND_REMOVE)
            stopSelf()
        }
    }
    super.onTaskRemoved(rootIntent)
}
```

Notification-Text-Helper `updateNotificationForState()` — wenn BLE + GPS beides
aktiv, „Radiacode + GPS-Aufzeichnung"; nur GPS → „GPS-Aufzeichnung läuft"; nur BLE
→ bisheriger `lastTitle`/`lastBody`. Implementation kurz:

```kotlin
private fun updateNotificationForState() {
    val title = when {
        session != null && gpsTrackRecorder != null -> "Radiacode + GPS-Aufzeichnung"
        gpsTrackRecorder != null -> "GPS-Aufzeichnung läuft"
        else -> lastTitle
    }
    lastTitle = title
    ensureForeground()
}
```

In `ACTION_START_TRACK` (bestehend, Radiacode): so erweitern, dass Custom-Extras
akzeptiert werden:

```kotlin
val rateStr = intent.getStringExtra(EXTRA_SAMPLE_RATE)
val kindStr = intent.getStringExtra(EXTRA_SAMPLE_RATE_KIND)
val sampleRate = if (kindStr != null) parseSampleRate(intent)
                 else if (rateStr != null) at.ffnd.einsatzkarte.radiacode.track.SampleRate.fromString(rateStr)
                 else { Log.w(TAG, "start-track: missing rate"); return@when }
val config = TrackConfig(
    firecallId = firecallId, layerId = layerId,
    sampleRate = sampleRate,
    deviceLabel = deviceLabel, creator = creator, firestoreDb = firestoreDb,
)
```

### `RadiacodeNotificationPlugin.java`

Zwei neue Methoden:

```java
@PluginMethod
public void startGpsTrack(PluginCall call) {
    String firecallId = call.getString("firecallId");
    String lineId     = call.getString("lineId");
    String firestoreDb= call.getString("firestoreDb", "");
    String creator    = call.getString("creator", "");
    String kind       = call.getString("sampleRateKind", "normal");
    Double initLat    = call.getDouble("initialLat");
    Double initLng    = call.getDouble("initialLng");
    if (firecallId == null || lineId == null) {
        call.reject("firecallId, lineId required");
        return;
    }
    Intent intent = new Intent(getContext(), RadiacodeForegroundService.class);
    intent.setAction(RadiacodeForegroundService.ACTION_START_GPS_TRACK);
    intent.putExtra(RadiacodeForegroundService.EXTRA_FIRECALL_ID, firecallId);
    intent.putExtra(RadiacodeForegroundService.EXTRA_LINE_ID, lineId);
    intent.putExtra(RadiacodeForegroundService.EXTRA_FIRESTORE_DB, firestoreDb);
    intent.putExtra(RadiacodeForegroundService.EXTRA_CREATOR, creator);
    intent.putExtra(RadiacodeForegroundService.EXTRA_SAMPLE_RATE_KIND, kind);
    if (initLat != null) intent.putExtra(RadiacodeForegroundService.EXTRA_INITIAL_LAT, initLat.doubleValue());
    if (initLng != null) intent.putExtra(RadiacodeForegroundService.EXTRA_INITIAL_LNG, initLng.doubleValue());
    if ("custom".equals(kind)) {
        Double intv  = call.getDouble("customIntervalSec");
        Double dist  = call.getDouble("customDistanceM");
        Double ddose = call.getDouble("customDoseRateDeltaUSvH");
        if (intv  != null) intent.putExtra(RadiacodeForegroundService.EXTRA_CUSTOM_INTERVAL, intv.doubleValue());
        if (dist  != null) intent.putExtra(RadiacodeForegroundService.EXTRA_CUSTOM_DISTANCE, dist.doubleValue());
        if (ddose != null) intent.putExtra(RadiacodeForegroundService.EXTRA_CUSTOM_DOSE_DELTA, ddose.doubleValue());
    }
    startService(intent);
    call.resolve();
}

@PluginMethod
public void stopGpsTrack(PluginCall call) {
    Intent intent = new Intent(getContext(), RadiacodeForegroundService.class);
    intent.setAction(RadiacodeForegroundService.ACTION_STOP_GPS_TRACK);
    getContext().startService(intent);
    call.resolve();
}
```

Die bestehende `startTrackRecording(call)` wird so erweitert, dass sie neben
`sampleRate` (Legacy, Preset-String) zusätzlich `sampleRateKind` plus die vier
`custom*`-Werte durchreicht (identischer Block wie in `startGpsTrack`).

**Commit**

```bash
git add capacitor/android/app/src/main/java/at/ffnd/einsatzkarte/RadiacodeForegroundService.kt \
        capacitor/android/app/src/main/java/at/ffnd/einsatzkarte/RadiacodeNotificationPlugin.java
git commit -m "feat(gpstrack): service+plugin actions for gps-track + custom sample rate"
```

---

## Task 6: TS — `SampleRateSpec`-Typ + Layer-Schema

**Ziel:** TS-Typ für Custom-Rate einführen; `RATE_CONFIG` + bestehende Call-Sites,
die `SampleRate` (String-Enum) erwarten, so umstellen, dass sie `SampleRateSpec`
akzeptieren.

**Files:**

- Modify: `src/hooks/radiacode/types.ts`
- Modify: `src/components/firebase/firestore.ts` (falls `sampleRate` dort typisiert ist; sonst überspringen)
- Modify (TS Call-Sites, die das Typ-Constraint treffen): `TrackStartDialog.tsx`, `RecordButton.tsx`, `useRadiacodePointRecorder.ts`, `nativeTrackBridge.ts`, `layerFactory.ts` — nur Typen anpassen, Logic in den Folge-Tasks.
- Add: `src/hooks/radiacode/types.test.ts` (neu, für Type-Guards)

**Step 1: Tests**

`types.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
  SampleRateSpec,
  isCustomSampleRate,
  resolveCustomThresholds,
  serializeSampleRateToBridge,
} from './types';

describe('SampleRateSpec', () => {
  it('preset strings are valid', () => {
    const s: SampleRateSpec = 'normal';
    expect(isCustomSampleRate(s)).toBe(false);
  });
  it('custom shape is valid', () => {
    const s: SampleRateSpec = { kind: 'custom', intervalSec: 10, distanceM: 5 };
    expect(isCustomSampleRate(s)).toBe(true);
  });
  it('serialize preset returns { sampleRateKind }', () => {
    expect(serializeSampleRateToBridge('hoch')).toEqual({ sampleRateKind: 'hoch' });
  });
  it('serialize custom returns kind + thresholds (skipping undefined)', () => {
    const out = serializeSampleRateToBridge({
      kind: 'custom', intervalSec: 10, distanceM: undefined, doseRateDeltaUSvH: 0.2,
    });
    expect(out).toEqual({
      sampleRateKind: 'custom',
      customIntervalSec: 10,
      customDoseRateDeltaUSvH: 0.2,
    });
  });
});
```

**Step 2: Run, FAIL**

Run: `NO_COLOR=1 npx vitest run src/hooks/radiacode/types.test.ts`

**Step 3: Implementation**

`types.ts` ergänzen:

```ts
export type SampleRatePreset = 'niedrig' | 'normal' | 'hoch';
// Backwards-compat: weiterhin als SampleRate exportieren.
export type SampleRate = SampleRatePreset;

export interface CustomSampleRate {
  kind: 'custom';
  intervalSec?: number;
  distanceM?: number;
  doseRateDeltaUSvH?: number;
}

export type SampleRateSpec = SampleRatePreset | CustomSampleRate;

export function isCustomSampleRate(s: SampleRateSpec): s is CustomSampleRate {
  return typeof s === 'object' && s !== null && s.kind === 'custom';
}

export interface BridgeSampleRatePayload {
  sampleRateKind: 'niedrig' | 'normal' | 'hoch' | 'custom';
  customIntervalSec?: number;
  customDistanceM?: number;
  customDoseRateDeltaUSvH?: number;
}

export function serializeSampleRateToBridge(s: SampleRateSpec): BridgeSampleRatePayload {
  if (!isCustomSampleRate(s)) return { sampleRateKind: s };
  const out: BridgeSampleRatePayload = { sampleRateKind: 'custom' };
  if (s.intervalSec != null) out.customIntervalSec = s.intervalSec;
  if (s.distanceM != null) out.customDistanceM = s.distanceM;
  if (s.doseRateDeltaUSvH != null) out.customDoseRateDeltaUSvH = s.doseRateDeltaUSvH;
  return out;
}

export function resolveCustomThresholds(s: SampleRateSpec): CustomSampleRate | null {
  if (!isCustomSampleRate(s)) return null;
  return s;
}
```

Firestore-Schema: `layer.sampleRate` typisieren auf `SampleRateSpec` (falls heute
typisiert). Das Feld wird bereits heute frei gelesen; TS-Union deckt sowohl
String-Legacy als auch den neuen Struct-Form ab.

**Step 4: Tests PASS**

**Step 5: Commit**

```bash
git add src/hooks/radiacode/types.ts src/hooks/radiacode/types.test.ts src/components/firebase/firestore.ts
git commit -m "feat(gpstrack): SampleRateSpec TS type + bridge serializer"
```

---

## Task 7: TS — Capacitor-Bridges (`nativeGpsTrackBridge` + Custom in `nativeTrackBridge`)

**Ziel:** Neue TS-Bridge für GPS-Track + `nativeTrackBridge` so anpassen, dass es
auch Custom-Spec sendet.

**Files:**

- Create: `src/hooks/recording/nativeGpsTrackBridge.ts`
- Create: `src/hooks/recording/nativeGpsTrackBridge.test.ts`
- Modify: `src/hooks/radiacode/nativeTrackBridge.ts`
- Modify: `src/hooks/radiacode/nativeTrackBridge.test.ts`

**Step 1: Tests**

`nativeGpsTrackBridge.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
const startGpsTrack = vi.fn().mockResolvedValue(undefined);
const stopGpsTrack = vi.fn().mockResolvedValue(undefined);
vi.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: () => true, getPlatform: () => 'android' },
  registerPlugin: () => ({ startGpsTrack, stopGpsTrack }),
}));
import { nativeStartGpsTrack, nativeStopGpsTrack } from './nativeGpsTrackBridge';

beforeEach(() => { startGpsTrack.mockClear(); stopGpsTrack.mockClear(); });

describe('nativeGpsTrackBridge', () => {
  it('forwards preset sampleRate', async () => {
    await nativeStartGpsTrack({
      firecallId: 'f', lineId: 'l', firestoreDb: '', creator: 'me',
      sampleRate: 'normal',
    });
    expect(startGpsTrack).toHaveBeenCalledWith(expect.objectContaining({
      firecallId: 'f', lineId: 'l', sampleRateKind: 'normal',
    }));
  });

  it('forwards custom sampleRate with only provided fields', async () => {
    await nativeStartGpsTrack({
      firecallId: 'f', lineId: 'l', firestoreDb: '', creator: 'me',
      sampleRate: { kind: 'custom', intervalSec: 10 },
    });
    expect(startGpsTrack).toHaveBeenCalledWith(expect.objectContaining({
      sampleRateKind: 'custom', customIntervalSec: 10,
    }));
    const arg = startGpsTrack.mock.calls[0][0];
    expect(arg.customDistanceM).toBeUndefined();
    expect(arg.customDoseRateDeltaUSvH).toBeUndefined();
  });

  it('passes initial position when provided', async () => {
    await nativeStartGpsTrack({
      firecallId: 'f', lineId: 'l', firestoreDb: '', creator: 'me',
      sampleRate: 'normal', initialLat: 47.0, initialLng: 16.0,
    });
    expect(startGpsTrack).toHaveBeenCalledWith(expect.objectContaining({
      initialLat: 47.0, initialLng: 16.0,
    }));
  });

  it('stopGpsTrack delegates', async () => {
    await nativeStopGpsTrack();
    expect(stopGpsTrack).toHaveBeenCalledTimes(1);
  });
});
```

**Step 2: Run, FAIL.**

**Step 3: Implementation**

`nativeGpsTrackBridge.ts`:

```ts
import { Capacitor, registerPlugin } from '@capacitor/core';
import { SampleRateSpec, serializeSampleRateToBridge } from '../radiacode/types';

export interface NativeGpsTrackOpts {
  firecallId: string;
  lineId: string;
  firestoreDb: string;
  creator: string;
  sampleRate: SampleRateSpec;
  initialLat?: number;
  initialLng?: number;
}

interface GpsTrackPlugin {
  startGpsTrack(opts: Record<string, unknown>): Promise<void>;
  stopGpsTrack(): Promise<void>;
}

const GpsTrack = registerPlugin<GpsTrackPlugin>('RadiacodeNotification');

export function isNativeGpsTrackingAvailable(): boolean {
  return (
    typeof window !== 'undefined' &&
    Capacitor.isNativePlatform() &&
    Capacitor.getPlatform() === 'android'
  );
}

export async function nativeStartGpsTrack(opts: NativeGpsTrackOpts): Promise<void> {
  const rate = serializeSampleRateToBridge(opts.sampleRate);
  const payload: Record<string, unknown> = {
    firecallId: opts.firecallId,
    lineId: opts.lineId,
    firestoreDb: opts.firestoreDb,
    creator: opts.creator,
    ...rate,
  };
  if (opts.initialLat != null) payload.initialLat = opts.initialLat;
  if (opts.initialLng != null) payload.initialLng = opts.initialLng;
  console.log('[GpsTrack/native] startGpsTrack', payload);
  await GpsTrack.startGpsTrack(payload);
}

export async function nativeStopGpsTrack(): Promise<void> {
  console.log('[GpsTrack/native] stopGpsTrack');
  await GpsTrack.stopGpsTrack();
}
```

`nativeTrackBridge.ts` — den `sampleRate`-Typ auf `SampleRateSpec` erweitern,
gleichen Serializer nutzen, Legacy-Feld `sampleRate` (Preset-String) nicht mehr
direkt mitschicken, sondern als `sampleRateKind` + `custom*`.

Bestehende Tests in `nativeTrackBridge.test.ts` entsprechend anpassen (Preset-Fall
erwartet `sampleRateKind: 'normal'`).

**Step 4: Tests PASS**

**Step 5: Commit**

```bash
git add src/hooks/recording/nativeGpsTrackBridge.ts \
        src/hooks/recording/nativeGpsTrackBridge.test.ts \
        src/hooks/radiacode/nativeTrackBridge.ts \
        src/hooks/radiacode/nativeTrackBridge.test.ts
git commit -m "feat(gpstrack): nativeGpsTrackBridge + custom sample-rate in nativeTrackBridge"
```

---

## Task 8: TS — `useGpsLineRecorder` Plattform-Switch

**Ziel:** Auf Android native delegiert `useGpsLineRecorder` an
`nativeStart/StopGpsTrack` und deaktiviert den Web-Polling-`useEffect`. Auf Web
bleibt das Verhalten exakt.

**Files:**

- Modify: `src/hooks/recording/useGpsLineRecorder.ts`
- Create/Modify: `src/hooks/recording/useGpsLineRecorder.test.ts`

**Step 1: Tests**

Tests müssen sowohl den Web- als auch den Native-Pfad abdecken. Der Hook nutzt
react-leaflet's `useMap` und diverse Firebase-Hooks — ein „echter" Test bräuchte
ein üppiges Wrapper-Setup. Alternative: **Extrahiere eine pure Funktion**
`decideRecordingBackend()` aus dem Hook (Native vs. Web) und teste die.

Wenn der Hook bereits einen Test hat, ihn erweitern; sonst einen schlanken Test
für die Backend-Entscheidung + den Bridge-Aufruf schreiben.

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const nativeStart = vi.fn().mockResolvedValue(undefined);
const nativeStop  = vi.fn().mockResolvedValue(undefined);
let nativeAvailable = true;

vi.mock('./nativeGpsTrackBridge', () => ({
  isNativeGpsTrackingAvailable: () => nativeAvailable,
  nativeStartGpsTrack: (...a: unknown[]) => nativeStart(...a),
  nativeStopGpsTrack:  (...a: unknown[]) => nativeStop(...a),
}));

// Kleine Testhilfe: reine Funktion aus useGpsLineRecorder testen.
import { __testing_decideBackend } from './useGpsLineRecorder';

describe('useGpsLineRecorder backend selection', () => {
  beforeEach(() => { nativeStart.mockClear(); nativeStop.mockClear(); });

  it('uses native when available', () => {
    nativeAvailable = true;
    expect(__testing_decideBackend()).toBe('native');
  });
  it('uses web when not available', () => {
    nativeAvailable = false;
    expect(__testing_decideBackend()).toBe('web');
  });
});
```

Plus einen Integrations-Smoke-Test, der den Hook in einem Dummy-`useMap`-Provider
rendert und dann `startRecording(...)` aufruft und prüft, dass `nativeStart`
mit der korrekt angelegten `lineId` gerufen wurde. **Wenn das Test-Setup zu
komplex wird, reicht für diese Task der Pure-Function-Test** — die Integration
wird im manuellen Smoke-Test in Task 11 abgedeckt.

**Step 2: Run, FAIL**

**Step 3: Implementation**

`useGpsLineRecorder.ts`:

- Signature erweitern um optionales `sampleRate: SampleRateSpec` (Default `'normal'`).
- Nach `addFirecallItem(newRecord)` → wenn native verfügbar →
  `nativeStartGpsTrack({ firecallId, lineId: ref.id, firestoreDb, creator, sampleRate, initialLat: pos.lat, initialLng: pos.lng })` aufrufen und `setIsRecording(true)` setzen.
  Den **Web-Polling-`useEffect` überspringen**, indem eine neue State-Variable
  `backend: 'web' | 'native'` die Gate-Bedingung `isRecording && backend === 'web'`
  erzwingt.
- `stopRecording(pos)` → wenn native: `nativeStopGpsTrack()`, `setIsRecording(false)`,
  `setRecordItem(undefined)`. **Kein** lokaler `addPos`-Aufruf mehr (den finalen
  Fix schreibt der Service bereits vor dem Stop).
- `firecallId`, `firestoreDb`, `creator` werden benötigt → über bestehende Hooks
  (`useFirecallId()`, `useFirebaseLogin()`, `process.env.NEXT_PUBLIC_FIRESTORE_DB`)
  beziehen.
- Neues Export `__testing_decideBackend` als interner Test-Helper.

**Step 4: Tests PASS**

**Step 5: Commit**

```bash
git add src/hooks/recording/useGpsLineRecorder.ts src/hooks/recording/useGpsLineRecorder.test.ts
git commit -m "feat(gpstrack): useGpsLineRecorder delegates to native bridge on android"
```

---

## Task 9: TS — `TrackStartDialog` um Custom-UI erweitern

**Ziel:** Vierte Radio-Option „Custom" mit drei Zahlenfeldern (Dose-Feld nur im
Radiacode-Mode sichtbar). Start-Button ist deaktiviert, wenn alle Felder leer
sind.

**Files:**

- Modify: `src/components/Map/TrackStartDialog.tsx`
- Modify: `src/components/Map/TrackStartDialog.test.tsx`

**Step 1: Tests**

```tsx
describe('TrackStartDialog — Custom-Modus', () => {
  it('blendet Dose-Feld im GPS-Mode aus', async () => {
    const user = userEvent.setup();
    render(<TrackStartDialog open onClose={() => {}} onStart={() => {}} />);
    await user.click(screen.getByLabelText('GPS-Track'));
    await user.click(screen.getByLabelText('Custom'));
    expect(screen.getByLabelText(/Abstand \(m\)/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Zeitintervall \(s\)/)).toBeInTheDocument();
    expect(screen.queryByLabelText(/Dosisleistungs-Delta/)).toBeNull();
  });

  it('zeigt Dose-Feld im Radiacode-Mode', async () => {
    const user = userEvent.setup();
    render(
      <TrackStartDialog
        open onClose={() => {}} onStart={() => {}}
        defaultDevice={{ id: 'x', name: 'RC', serial: '1' }}
        radiacodeStatus="connected"
      />,
    );
    await user.click(screen.getByLabelText(/Strahlenmessung/));
    await user.click(screen.getByLabelText('Custom'));
    expect(screen.getByLabelText(/Dosisleistungs-Delta/)).toBeInTheDocument();
  });

  it('deaktiviert Start, wenn alle Custom-Felder leer', async () => {
    const user = userEvent.setup();
    render(<TrackStartDialog open onClose={() => {}} onStart={() => {}} />);
    await user.click(screen.getByLabelText('GPS-Track'));
    await user.click(screen.getByLabelText('Custom'));
    const startBtn = screen.getByRole('button', { name: 'Starten' });
    expect(startBtn).toBeDisabled();
  });

  it('emittiert custom-struct on Starten', async () => {
    const user = userEvent.setup();
    const onStart = vi.fn();
    render(<TrackStartDialog open onClose={() => {}} onStart={onStart} />);
    await user.click(screen.getByLabelText('GPS-Track'));
    await user.click(screen.getByLabelText('Custom'));
    await user.type(screen.getByLabelText(/Abstand \(m\)/), '7');
    await user.type(screen.getByLabelText(/Zeitintervall \(s\)/), '20');
    await user.click(screen.getByRole('button', { name: 'Starten' }));
    expect(onStart).toHaveBeenCalledWith(expect.objectContaining({
      mode: 'gps',
      sampleRate: { kind: 'custom', distanceM: 7, intervalSec: 20 },
    }));
  });
});
```

**Step 2: Run, FAIL**

**Step 3: Implementation**

- `TrackStartConfig.sampleRate: SampleRateSpec` (importiert aus
  `radiacode/types`).
- Neuer local State `customDistance/customInterval/customDose` (jeweils `string`),
  und ein 4. Radio `custom`.
- `buildSampleRate(): SampleRateSpec` — bei `custom` aus den (ggf. leeren)
  Zahlenfeldern konstruieren; nicht-leere parsen mit `Number(x)` und nur setzen,
  wenn finite > 0. Im Radiacode-Mode zusätzlich das `doseRateDeltaUSvH`-Feld.
- Start-Button-`disabled`-Regel erweitern: wenn Custom + keines der drei Felder
  gesetzt → disabled mit Tooltip „Mindestens ein Schwellwert erforderlich".
- `handleStart` nutzt `buildSampleRate()` statt des bisherigen
  `sampleRate`-State-Strings.

Für Radiacode-Mode existierende Preset-Voreinstellung aus Layer bleibt; beim
Wechsel auf Custom werden die Voreinstellungen aus dem Layer geleert (fresh
start).

**Step 4: Tests PASS**

**Step 5: Commit**

```bash
git add src/components/Map/TrackStartDialog.tsx src/components/Map/TrackStartDialog.test.tsx
git commit -m "feat(gpstrack): custom-mode inputs in TrackStartDialog"
```

---

## Task 10: TS — `RecordButton` + `useRadiacodePointRecorder` durchreichen

**Ziel:** Die neue `SampleRateSpec` von Dialog → Recorder propagieren.

**Files:**

- Modify: `src/components/Map/RecordButton.tsx`
- Modify: `src/hooks/recording/useRadiacodePointRecorder.ts` (Signatur auf `SampleRateSpec`)
- Modify: `src/hooks/recording/useRadiacodePointRecorder.test.tsx`
- Modify: `src/hooks/radiacode/layerFactory.ts` (falls `sampleRate`-Feld dort typisiert ist)

**Step 1: Tests**

In `RecordButton` ist ein Test für den Start-Pfad evtl. nicht vorhanden — der
bestehende Pfad bleibt; neu ist nur, dass `gps.startRecording(..., sampleRate)`
mit der Spec aufgerufen wird. Der Test des Dialogs (Task 9) deckt die Erzeugung
der Spec ab. In dieser Task genügt das Typ-Durchreichen + ggf. Anpassung des
Radiacode-Point-Recorder-Tests.

`useRadiacodePointRecorder.test.tsx`: Custom-Case analog zum Preset-Case
ergänzen:

```ts
it('verwendet Custom-Thresholds', () => {
  // ... arrange mit sampleRate: { kind:'custom', intervalSec: 10 } ...
  // erwarten, dass beim zweiten Messwert (<10s, <Distanz) nichts geschrieben wird
});
```

**Step 2: Run, FAIL**

**Step 3: Implementation**

- `RecordButton`: bestehenden `setRadiacodeSampleRate(config.sampleRate)` von
  `SampleRate` auf `SampleRateSpec` anpassen. `gps.startRecording(pos)` →
  `gps.startRecording(pos, config.sampleRate)`.
- `useRadiacodePointRecorder`: `sampleRate: SampleRateSpec` akzeptieren; die
  Sample-Entscheidung über die gleiche Helper-Funktion
  (`decideShouldRecordPoint(distance, dtSec, doseDelta, rate)` in `sampleGate.ts`,
  neue kleine TS-Utility analog zu Kotlin-`SampleGate`) nehmen. Die bisherige
  Heuristik mit `RATE_CONFIG` bleibt für Presets bestehen.
- `layerFactory.ts`: `sampleRate`-Feldtyp von `SampleRate` auf `SampleRateSpec`
  erweitern.

**Step 4: Tests PASS**

**Step 5: Commit**

```bash
git add src/components/Map/RecordButton.tsx \
        src/hooks/recording/useRadiacodePointRecorder.ts \
        src/hooks/recording/useRadiacodePointRecorder.test.tsx \
        src/hooks/radiacode/layerFactory.ts
git commit -m "feat(gpstrack): thread SampleRateSpec through record button + point recorder"
```

---

## Task 11: Final Checks + Capacitor-Sync + Smoke-Test-Checkliste

**Ziel:** Volle Check-Matrix ausführen, Capacitor-Android-Layer syncen (damit der
Kotlin-Code im Plugin-Registry auftaucht), manuelle Smoke-Test-Checkliste am Ende
dieser Task ins PR-Beschreibungs-Template kopieren.

**Files:** keine neuen Dateien.

**Step 1: TypeScript**

```bash
npx tsc --noEmit
```

Expected: 0 Fehler. **Bei Fehlern: stoppen und fixen, ohne sie zu ignorieren.**

**Step 2: ESLint**

```bash
npx eslint
```

Expected: 0 Errors, 0 Warnings.

**Step 3: Vitest**

```bash
NO_COLOR=1 npx vitest run
```

Expected: alle (inkl. der in diesem Plan ergänzten) passing.

**Step 4: Next-Build**

```bash
npx next build --webpack
```

Expected: clean build.

**Step 5: Kotlin Unit-Tests**

```bash
cd capacitor/android && ./gradlew :app:testDebugUnitTest
```

Expected: alle passing.

**Step 6: Capacitor-Sync**

```bash
npx cap sync android
```

**Step 7: Manuelle Smoke-Test-Checkliste (für die PR-Beschreibung notieren)**

- [ ] GPS-Track in Android-Build starten, Bildschirm für 2 Min sperren,
      entsperren → Line hat mehrere neue Punkte.
- [ ] App-Swipe stoppt den Track (Line-Item bekommt keine weiteren Punkte).
- [ ] Custom-Modus im GPS-Dialog: Felder leer → Start disabled; 1 Feld gesetzt → Start enabled.
- [ ] Custom-Modus im Radiacode-Dialog: Dose-Delta-Feld sichtbar; Setzen und
      starten, Bewegung mit hoher/niedriger Dose → Marker erscheinen nur bei
      Grenzüberschreitung.
- [ ] Regression: klassischer GPS-Track auf Web-Browser (Desktop) funktioniert
      unverändert.
- [ ] Regression: Radiacode-Track mit Preset (niedrig/normal/hoch) schreibt wie
      bisher.

**Step 8: `next-env.d.ts` zurücksetzen + finalen Commit**

```bash
git checkout -- next-env.d.ts
git status   # sollte leer sein
```

Falls während der Checks noch kleinere Nachbesserungen nötig wurden (z. B. Lint):

```bash
git add -u
git commit -m "chore(gpstrack): final cleanup from check matrix"
```

---

## Execution Order

Tasks in strikter Reihenfolge 1 → 11. Keine Task vorziehen, weil Task N+1
oft die Typen/Module aus Task N braucht.

## Done when

- Alle Checks in Task 11 grün.
- Design-Doc + Plan-Doc + 11 feature-Commits auf `feat/native-gps-track`.
- Manuelle Smoke-Checkliste dokumentiert im PR (bei PR-Erstellung).
