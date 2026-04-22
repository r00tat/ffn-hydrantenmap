package at.ffnd.einsatzkarte.gpstrack

import at.ffnd.einsatzkarte.radiacode.track.SampleRate
import org.junit.Assert.*
import org.junit.Test

private class FakeLineUpdater : LineUpdater {
    data class Appended(val firecallId: String, val lineId: String, val lat: Double, val lng: Double, val ts: Long)
    val writes = mutableListOf<Appended>()
    override fun append(
        firecallId: String,
        lineId: String,
        lat: Double,
        lng: Double,
        ts: Long,
        onSuccess: () -> Unit,
        onFailure: (Throwable) -> Unit,
    ) {
        writes += Appended(firecallId, lineId, lat, lng, ts)
        onSuccess()
    }
}

private class BlockingLineUpdater : LineUpdater {
    val writes = mutableListOf<Triple<String, Double, Double>>()
    private val pending = mutableListOf<() -> Unit>()
    override fun append(
        firecallId: String, lineId: String, lat: Double, lng: Double, ts: Long,
        onSuccess: () -> Unit, onFailure: (Throwable) -> Unit,
    ) {
        writes += Triple(lineId, lat, lng)
        pending += onSuccess
    }
    fun releaseAll() { val p = pending.toList(); pending.clear(); p.forEach { it() } }
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
        assertEquals("fc", w.writes[0].firecallId)
        assertEquals("line1", w.writes[0].lineId)
    }

    @Test fun `second fix gated by sample rate`() {
        val w = FakeLineUpdater()
        var now = 0L
        val rec = GpsTrackRecorder(baseConfig, w, nowMs = { now })
        rec.onLocation(47.0, 16.0); now += 500L
        rec.onLocation(47.00001, 16.00001) // <1s → hard floor rejects
        assertEquals(1, w.writes.size)
        now += 2_000L
        rec.onLocation(47.00001, 16.00001) // >=1s floor, but distance <<5m → still no write
        assertEquals(1, w.writes.size)
        now += 20_000L
        rec.onLocation(47.00001, 16.00001) // dt > Normal.maxInterval (15s) → forces write
        assertEquals(2, w.writes.size)
    }

    @Test fun `non-finite fix is ignored`() {
        val w = FakeLineUpdater()
        val rec = GpsTrackRecorder(baseConfig, w, nowMs = { 0L })
        rec.onLocation(Double.NaN, 16.0)
        rec.onLocation(47.0, Double.POSITIVE_INFINITY)
        assertEquals(0, w.writes.size)
        rec.onLocation(47.0, 16.0) // sanity: finite fix still works
        assertEquals(1, w.writes.size)
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

    @Test fun `drops fixes while previous write is in flight`() {
        val w = BlockingLineUpdater()
        var now = 0L
        val rec = GpsTrackRecorder(baseConfig, w, nowMs = { now })
        rec.onLocation(47.0, 16.0)
        assertEquals(1, w.writes.size)
        now += 20_000L
        rec.onLocation(47.001, 16.0) // would normally pass the gate, but in-flight
        assertEquals(1, w.writes.size)
        w.releaseAll()
        rec.onLocation(47.001, 16.0)
        assertEquals(2, w.writes.size)
    }
}
