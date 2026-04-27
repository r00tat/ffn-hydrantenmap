package at.ffnd.einsatzkarte.radiacode.types

/**
 * Alarm limits.
 *
 * Mirrors Python `AlarmLimits` from radiacode/types.py.
 *
 * Numeric limits are kept as `Double` (Python `float` is 64-bit). The unit
 * fields ([countUnit], [doseUnit]) indicate per-second vs per-minute and
 * Sievert vs Roentgen respectively, depending on device configuration.
 */
data class AlarmLimits(
    val l1CountRate: Double,
    val l2CountRate: Double,
    val countUnit: String,
    val l1DoseRate: Double,
    val l2DoseRate: Double,
    val l1Dose: Double,
    val l2Dose: Double,
    val doseUnit: String,
)
