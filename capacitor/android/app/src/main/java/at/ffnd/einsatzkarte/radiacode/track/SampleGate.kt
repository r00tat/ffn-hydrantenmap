package at.ffnd.einsatzkarte.radiacode.track

data class SampleRateConfig(
    val minDistanceMeters: Double,
    val minIntervalSec: Double,
    val maxIntervalSec: Double,
) {
    companion object {
        fun of(rate: String): SampleRateConfig = when (rate) {
            "niedrig" -> SampleRateConfig(10.0, 1.0, 30.0)
            "normal"  -> SampleRateConfig(5.0, 1.0, 15.0)
            "hoch"    -> SampleRateConfig(2.0, 1.0, 5.0)
            else      -> throw IllegalArgumentException("Unknown sample rate: $rate")
        }
    }
}

object SampleGate {
    fun shouldSample(distanceMeters: Double, secondsSinceLast: Double, config: SampleRateConfig): Boolean {
        if (secondsSinceLast < config.minIntervalSec) return false
        if (secondsSinceLast >= config.maxIntervalSec) return true
        return distanceMeters >= config.minDistanceMeters
    }
}
