package at.ffnd.einsatzkarte.radiacode.types

import java.time.Instant

/**
 * Raw radiation measurement data without error calculations.
 *
 * Mirrors Python `RawData` from radiacode/types.py.
 */
data class RawData(
    val dt: Instant,
    val countRate: Float,
    val doseRate: Float,
)
