package at.ffnd.einsatzkarte.radiacode.types

import java.time.Duration

/**
 * Radiation energy spectrum measurement data.
 *
 * Mirrors Python `Spectrum` from radiacode/types.py.
 *
 * `a0`, `a1`, `a2` are IEEE-754 32-bit floats from the wire format.
 */
data class Spectrum(
    val duration: Duration,
    val a0: Float,
    val a1: Float,
    val a2: Float,
    val counts: List<Int>,
)
