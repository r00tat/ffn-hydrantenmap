package at.ffnd.einsatzkarte.radiacode.protocol

/**
 * Status / control bit-flags (Python `CTRL` in radiacode/types.py).
 */
enum class Ctrl(val mask: Int) {
    BUTTONS(1 shl 0),
    CLICKS(1 shl 1),
    DOSE_RATE_ALARM_1(1 shl 2),
    DOSE_RATE_ALARM_2(1 shl 3),
    DOSE_RATE_OUT_OF_SCALE(1 shl 4),
    DOSE_ALARM_1(1 shl 5),
    DOSE_ALARM_2(1 shl 6),
    DOSE_OUT_OF_SCALE(1 shl 7),
}
