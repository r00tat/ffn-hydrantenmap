package at.ffnd.einsatzkarte.radiacode.types

import java.time.Instant

/**
 * Real-time radiation measurement data from the device.
 *
 * Mirrors Python `RealTimeData` from radiacode/types.py.
 *
 * Field types match the wire format decoded in `databuf.py`:
 * `count_rate, dose_rate` are raw IEEE-754 32-bit floats; `count_rate_err`
 * and `dose_rate_err` are u16/10 (Double after division); `flags` is u16;
 * `real_time_flags` is u8.
 */
data class RealTimeData(
    val dt: Instant,
    val countRate: Float,
    val countRateErr: Double,
    val doseRate: Float,
    val doseRateErr: Double,
    val flags: Int,
    val realTimeFlags: Int,
)
