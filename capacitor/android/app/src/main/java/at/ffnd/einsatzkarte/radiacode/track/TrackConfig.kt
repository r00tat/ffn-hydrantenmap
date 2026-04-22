package at.ffnd.einsatzkarte.radiacode.track

data class TrackConfig(
    val firecallId: String,
    val layerId: String,
    val sampleRate: SampleRate,
    val deviceLabel: String,
    val creator: String,
    val firestoreDb: String,
)
