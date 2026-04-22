package at.ffnd.einsatzkarte.radiacode.track

import at.ffnd.einsatzkarte.radiacode.Measurement
import org.junit.Assert.assertEquals
import org.junit.Test

class TrackRecorderTest {

    private fun meas(tsMs: Long = 0L, dose: Double = 0.1): Measurement = Measurement(
        timestampMs = tsMs,
        dosisleistungUSvH = dose,
        cps = 5.0,
        doseUSv = null, durationSec = null, temperatureC = null, chargePct = null,
        dosisleistungErrPct = null, cpsErrPct = null,
    )

    private val config = TrackConfig(
        firecallId = "fc1", layerId = "l1",
        sampleRate = SampleRate.Normal,
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

    @Test fun `non-finite dose rate is ignored`() {
        val w = FakeWriter()
        val r = TrackRecorder(config, w, nowMs = { 1_000L })
        r.onMeasurement(meas(dose = Double.NaN), LatLng(48.0, 16.0))
        r.onMeasurement(meas(dose = Double.POSITIVE_INFINITY), LatLng(48.0, 16.0))
        assertEquals(0, w.calls.size)
    }

    @Test fun `custom with dose delta writes when dose changes enough`() {
        val w = FakeWriter()
        var now = 0L
        val customConfig = TrackConfig(
            firecallId = "fc", layerId = "l1",
            sampleRate = SampleRate.Custom(
                maxIntervalSec = 3600.0,       // lange → nur dose zählt
                minDistanceMeters = 10_000.0,  // groß → nur dose zählt
                minDoseRateDeltaUSvH = 0.1,
            ),
            deviceLabel = "dev", creator = "me", firestoreDb = "",
        )
        val r = TrackRecorder(customConfig, w, nowMs = { now })
        val loc = LatLng(47.0, 16.0)

        // First measurement: always writes
        r.onMeasurement(meas(dose = 0.05), loc)
        assertEquals(1, w.calls.size)
        now += 2_000L

        // Delta 0.03 < 0.1 → skip (distance 0, dt 2s > floor but < maxInterval, dose delta below threshold)
        r.onMeasurement(meas(dose = 0.08), loc)
        assertEquals(1, w.calls.size)
        now += 2_000L

        // Delta 0.15 >= 0.1 → write
        r.onMeasurement(meas(dose = 0.20), loc)
        assertEquals(2, w.calls.size)
    }
}
