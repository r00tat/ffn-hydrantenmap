package at.ffnd.einsatzkarte.radiacode.track

import at.ffnd.einsatzkarte.radiacode.Measurement

data class MarkerWriteResult(
    val docId: String,
    val lat: Double,
    val lng: Double,
    val timestampMs: Long,
    val dosisleistungUSvH: Double,
    val cps: Double,
    val layerId: String,
)

interface MarkerWriter {
    fun write(
        config: TrackConfig,
        measurement: Measurement,
        lat: Double,
        lng: Double,
        onSuccess: (MarkerWriteResult) -> Unit,
        onFailure: (Throwable) -> Unit,
    )
}
