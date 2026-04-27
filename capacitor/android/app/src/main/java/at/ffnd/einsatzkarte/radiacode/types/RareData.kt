package at.ffnd.einsatzkarte.radiacode.types

import java.time.Instant

/**
 * Periodic device status and accumulated dose data.
 *
 * Mirrors Python `RareData` from radiacode/types.py.
 *
 * `duration` is u32 (seconds) → `Long`; `dose` is raw f32; `temperature`
 * and `chargeLevel` come from the decoder after a divide-by-100 (and
 * temperature offset) so `Double` is the right type.
 */
data class RareData(
    val dt: Instant,
    val duration: Long,
    val dose: Float,
    val temperature: Double,
    val chargeLevel: Double,
    val flags: Int,
)
