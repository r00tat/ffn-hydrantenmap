package at.ffnd.einsatzkarte.livelocation

import at.ffnd.einsatzkarte.radiacode.track.Haversine

/**
 * Drosselt GPS-Updates per OR-Schwellwert (Zeit ODER Distanz) und schreibt
 * jeweils das Live-Location-Dokument. Single-in-flight: solange das letzte
 * `writeSample()` läuft, werden weitere Sample-Calls verworfen — derselbe
 * Pattern wie [at.ffnd.einsatzkarte.gpstrack.GpsTrackRecorder].
 *
 * Thread-Kontrakt: `onLocation()`, `updateSettings()` und `stop()` müssen
 * vom selben Thread aufgerufen werden (Service-Main-Looper). `@Volatile`
 * sorgt für Cross-Thread-Sichtbarkeit, ersetzt aber keine Synchronisation
 * bei konkurrenten Aufrufen.
 *
 * Heartbeat: damit das Dokument nicht unter die TTL läuft, während der
 * Nutzer steht und kein neuer Fix kommt, sorgt das `intervalMs` als
 * Max-Wartezeit für ein Update — und der allererste Fix nach `start` wird
 * immer geschrieben.
 */
class LiveLocationPusher(
    private val config: LiveLocationConfig,
    private val sink: LiveLocationDocSink,
    intervalMs: Long,
    distanceM: Double,
    private val nowMs: () -> Long = System::currentTimeMillis,
) {
    private data class Last(val lat: Double, val lng: Double, val time: Long)

    @Volatile private var last: Last? = null
    @Volatile private var stopped = false
    @Volatile private var writeInFlight = false

    @Volatile private var intervalMs: Long = intervalMs.coerceAtLeast(1_000L)
    @Volatile private var distanceM: Double = distanceM.coerceAtLeast(0.0)

    fun updateSettings(newIntervalMs: Long, newDistanceM: Double) {
        intervalMs = newIntervalMs.coerceAtLeast(1_000L)
        distanceM = newDistanceM.coerceAtLeast(0.0)
    }

    fun onLocation(
        lat: Double,
        lng: Double,
        accuracy: Double? = null,
        heading: Double? = null,
        speed: Double? = null,
    ) {
        if (stopped) return
        if (!lat.isFinite() || !lng.isFinite()) return
        if (writeInFlight) return
        val now = nowMs()
        val l = last
        val shouldWrite = if (l == null) {
            true
        } else {
            val dist = Haversine.distanceMeters(l.lat, l.lng, lat, lng)
            val dt = now - l.time
            dt >= intervalMs || dist >= distanceM
        }
        if (!shouldWrite) return
        last = Last(lat, lng, now)
        writeInFlight = true
        sink.writeSample(
            config,
            LiveLocationSample(lat, lng, accuracy, heading, speed),
            onSuccess = { writeInFlight = false },
            onFailure = { writeInFlight = false },
        )
    }

    fun stop() {
        stopped = true
    }

    /**
     * Best-effort delete des Live-Location-Dokuments. Wird typischerweise
     * von außen direkt nach [stop] aufgerufen, damit der Nutzer nach dem
     * Beenden des Sharings nicht noch eine Stunde lang als „live" auf der
     * Karte erscheint (TTL übernimmt sonst nach 1 h).
     */
    fun deleteDoc() {
        sink.deleteDoc(config)
    }
}
