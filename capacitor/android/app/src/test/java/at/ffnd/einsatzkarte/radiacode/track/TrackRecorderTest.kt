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
