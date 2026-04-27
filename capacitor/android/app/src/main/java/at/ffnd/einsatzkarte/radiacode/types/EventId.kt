package at.ffnd.einsatzkarte.radiacode.types

/**
 * Device event identifiers (Python `EventId` in radiacode/types.py).
 *
 * NOTE: `LOW_BATTERY_SHUTOWN` keeps the typo from the Python source.
 */
enum class EventId(val value: Int) {
    POWER_OFF(0),
    POWER_ON(1),
    LOW_BATTERY_SHUTOWN(2),
    CHANGE_DEVICE_PARAMS(3),
    DOSE_RESET(4),
    USER_EVENT(5),
    BATTERY_EMPTY_ALARM(6),
    CHARGE_START(7),
    CHARGE_STOP(8),
    DOSE_RATE_ALARM1(9),
    DOSE_RATE_ALARM2(10),
    DOSE_RATE_OFFSCALE(11),
    DOSE_ALARM1(12),
    DOSE_ALARM2(13),
    DOSE_OFFSCALE(14),
    TEMPERATURE_TOO_LOW(15),
    TEMPERATURE_TOO_HIGH(16),
    TEXT_MESSAGE(17),
    MEMORY_SNAPSHOT(18),
    SPECTRUM_RESET(19),
    COUNT_RATE_ALARM1(20),
    COUNT_RATE_ALARM2(21),
    COUNT_RATE_OFFSCALE(22);

    companion object {
        /**
         * Look up an [EventId] by its wire value. Mirrors Python's
         * `EventId(v)` which raises `ValueError` for unknown values.
         *
         * @throws IllegalArgumentException if [v] is not a known event id.
         */
        fun fromValue(v: Int): EventId {
            for (e in values()) {
                if (e.value == v) return e
            }
            throw IllegalArgumentException("Unknown EventId value: $v")
        }
    }
}
