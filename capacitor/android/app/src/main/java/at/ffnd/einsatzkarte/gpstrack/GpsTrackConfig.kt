package at.ffnd.einsatzkarte.gpstrack

import at.ffnd.einsatzkarte.radiacode.track.SampleRate

data class GpsTrackConfig(
    val firecallId: String,
    val lineId: String,
    val sampleRate: SampleRate,
    val firestoreDb: String,
    val creator: String,
)
