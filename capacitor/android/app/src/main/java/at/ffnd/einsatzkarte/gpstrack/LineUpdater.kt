package at.ffnd.einsatzkarte.gpstrack

interface LineUpdater {
    fun append(
        firecallId: String,
        lineId: String,
        lat: Double,
        lng: Double,
        ts: Long,
        onSuccess: () -> Unit = {},
        onFailure: (Throwable) -> Unit = {},
    )
}
