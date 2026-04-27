package at.ffnd.einsatzkarte.radiacode.types

import java.time.Instant

/**
 * Database record for dose-rate measurements.
 *
 * Mirrors Python `DoseRateDB` from radiacode/types.py.
 *
 * `count` is u32 → `Long` to keep the full unsigned range.
 */
data class DoseRateDB(
    val dt: Instant,
    val count: Long,
    val countRate: Float,
    val doseRate: Float,
    val doseRateErr: Double,
    val flags: Int,
)
