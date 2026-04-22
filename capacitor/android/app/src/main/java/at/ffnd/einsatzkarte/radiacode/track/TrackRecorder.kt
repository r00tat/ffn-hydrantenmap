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
