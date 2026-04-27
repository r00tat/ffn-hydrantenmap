package at.ffnd.einsatzkarte.radiacode.types

import org.junit.Assert.assertEquals
import org.junit.Assert.assertThrows
import org.junit.Test

class EventIdTest {
    @Test fun `POWER_OFF`() = assertEquals(EventId.POWER_OFF, EventId.fromValue(0))
    @Test fun `POWER_ON`() = assertEquals(EventId.POWER_ON, EventId.fromValue(1))
    @Test fun `LOW_BATTERY_SHUTOWN`() = assertEquals(EventId.LOW_BATTERY_SHUTOWN, EventId.fromValue(2))
    @Test fun `CHANGE_DEVICE_PARAMS`() = assertEquals(EventId.CHANGE_DEVICE_PARAMS, EventId.fromValue(3))
    @Test fun `DOSE_RESET`() = assertEquals(EventId.DOSE_RESET, EventId.fromValue(4))
    @Test fun `USER_EVENT`() = assertEquals(EventId.USER_EVENT, EventId.fromValue(5))
    @Test fun `BATTERY_EMPTY_ALARM`() = assertEquals(EventId.BATTERY_EMPTY_ALARM, EventId.fromValue(6))
    @Test fun `CHARGE_START`() = assertEquals(EventId.CHARGE_START, EventId.fromValue(7))
    @Test fun `CHARGE_STOP`() = assertEquals(EventId.CHARGE_STOP, EventId.fromValue(8))
    @Test fun `DOSE_RATE_ALARM1`() = assertEquals(EventId.DOSE_RATE_ALARM1, EventId.fromValue(9))
    @Test fun `DOSE_RATE_ALARM2`() = assertEquals(EventId.DOSE_RATE_ALARM2, EventId.fromValue(10))
    @Test fun `DOSE_RATE_OFFSCALE`() = assertEquals(EventId.DOSE_RATE_OFFSCALE, EventId.fromValue(11))
    @Test fun `DOSE_ALARM1`() = assertEquals(EventId.DOSE_ALARM1, EventId.fromValue(12))
    @Test fun `DOSE_ALARM2`() = assertEquals(EventId.DOSE_ALARM2, EventId.fromValue(13))
    @Test fun `DOSE_OFFSCALE`() = assertEquals(EventId.DOSE_OFFSCALE, EventId.fromValue(14))
    @Test fun `TEMPERATURE_TOO_LOW`() = assertEquals(EventId.TEMPERATURE_TOO_LOW, EventId.fromValue(15))
    @Test fun `TEMPERATURE_TOO_HIGH`() = assertEquals(EventId.TEMPERATURE_TOO_HIGH, EventId.fromValue(16))
    @Test fun `TEXT_MESSAGE`() = assertEquals(EventId.TEXT_MESSAGE, EventId.fromValue(17))
    @Test fun `MEMORY_SNAPSHOT`() = assertEquals(EventId.MEMORY_SNAPSHOT, EventId.fromValue(18))
    @Test fun `SPECTRUM_RESET`() = assertEquals(EventId.SPECTRUM_RESET, EventId.fromValue(19))
    @Test fun `COUNT_RATE_ALARM1`() = assertEquals(EventId.COUNT_RATE_ALARM1, EventId.fromValue(20))
    @Test fun `COUNT_RATE_ALARM2`() = assertEquals(EventId.COUNT_RATE_ALARM2, EventId.fromValue(21))
    @Test fun `COUNT_RATE_OFFSCALE`() = assertEquals(EventId.COUNT_RATE_OFFSCALE, EventId.fromValue(22))

    @Test fun `unknown high value throws`() {
        assertThrows(IllegalArgumentException::class.java) { EventId.fromValue(99) }
    }

    @Test fun `unknown negative value throws`() {
        assertThrows(IllegalArgumentException::class.java) { EventId.fromValue(-1) }
    }

    @Test fun `all values distinct`() {
        val values = EventId.values().map { it.value }
        assertEquals(values.size, values.toSet().size)
    }

    @Test fun `entry count is 23`() = assertEquals(23, EventId.values().size)
}
