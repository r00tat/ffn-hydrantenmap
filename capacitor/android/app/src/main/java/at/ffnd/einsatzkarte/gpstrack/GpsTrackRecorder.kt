package at.ffnd.einsatzkarte.gpstrack

import at.ffnd.einsatzkarte.radiacode.track.Haversine
import at.ffnd.einsatzkarte.radiacode.track.SampleGate

/**
 * Thread-Kontrakt: onLocation() und stop() müssen aus demselben Thread
 * aufgerufen werden (typisch: Service-Main-Looper). @Volatile garantiert die
 * cross-thread-Sichtbarkeit von stopped; es ersetzt keine Synchronisation
 * bei konkurrenten onLocation()-Aufrufen.
 *
 * Schreiboperationen sind single-in-flight: Solange das letzte append() nicht
 * abgeschlossen ist, werden weitere onLocation()-Aufrufe verworfen (das SampleGate
 * debounced bereits ohnehin).
 */
class GpsTrackRecorder(
    private val config: GpsTrackConfig,
    private val updater: LineUpdater,
    private val nowMs: () -> Long = System::currentTimeMillis,
) {
    private data class Last(val lat: Double, val lng: Double, val time: Long)
    @Volatile private var last: Last? = null
    @Volatile private var stopped = false
    @Volatile private var writeInFlight = false

    fun onLocation(lat: Double, lng: Double) {
        if (stopped) return
        if (!lat.isFinite() || !lng.isFinite()) return
        if (writeInFlight) return
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
        writeInFlight = true
        updater.append(
            config.firecallId, config.lineId, lat, lng, now,
            onSuccess = { writeInFlight = false },
            onFailure = { writeInFlight = false },
        )
    }

    fun stop() { stopped = true }
}
