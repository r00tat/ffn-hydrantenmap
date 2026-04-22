package at.ffnd.einsatzkarte.radiacode.track

import kotlin.math.abs

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

sealed class SampleRate {
    data object Niedrig : SampleRate()
    data object Normal  : SampleRate()
    data object Hoch    : SampleRate()
    data class Custom(
        val maxIntervalSec: Double?,
        val minDistanceMeters: Double?,
        val minDoseRateDeltaUSvH: Double?,
    ) : SampleRate()

    companion object {
        fun fromString(s: String): SampleRate = when (s) {
            "niedrig" -> Niedrig
            "normal"  -> Normal
            "hoch"    -> Hoch
            else      -> throw IllegalArgumentException("Unknown sample rate: $s")
        }
    }
}

object SampleGate {
    private const val HARD_FLOOR_SEC = 1.0

    /**
     * Legacy API — AND-Logik über minInterval/maxInterval/minDistance.
     * Bleibt unverändert, solange bestehende Radiacode-Call-Sites SampleRateConfig verwenden;
     * Task 4 stellt sie auf die neue sealed-SampleRate-API um.
     */
    fun shouldSample(distanceMeters: Double, secondsSinceLast: Double, config: SampleRateConfig): Boolean {
        if (secondsSinceLast < config.minIntervalSec) return false
        if (secondsSinceLast >= config.maxIntervalSec) return true
        return distanceMeters >= config.minDistanceMeters
    }

    fun shouldSample(
        distanceM: Double,
        dtSec: Double,
        doseRateDeltaUSvH: Double?,
        rate: SampleRate,
    ): Boolean {
        if (dtSec < HARD_FLOOR_SEC) return false
        val c = when (rate) {
            SampleRate.Niedrig -> SampleRate.Custom(maxIntervalSec = 30.0, minDistanceMeters = 10.0, minDoseRateDeltaUSvH = null)
            SampleRate.Normal  -> SampleRate.Custom(maxIntervalSec = 15.0, minDistanceMeters =  5.0, minDoseRateDeltaUSvH = null)
            SampleRate.Hoch    -> SampleRate.Custom(maxIntervalSec =  5.0, minDistanceMeters =  2.0, minDoseRateDeltaUSvH = null)
            is SampleRate.Custom -> rate
        }
        c.maxIntervalSec?.let { if (dtSec >= it) return true }
        c.minDistanceMeters?.let { if (distanceM >= it) return true }
        c.minDoseRateDeltaUSvH?.let { schwelle ->
            if (doseRateDeltaUSvH != null && abs(doseRateDeltaUSvH) >= schwelle) return true
        }
        return false
    }
}
