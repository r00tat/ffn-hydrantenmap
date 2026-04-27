package at.ffnd.einsatzkarte.radiacode.protocol

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotEquals
import org.junit.Test

class CommandTest {
    @Test fun `GET_STATUS value`() = assertEquals(0x0005, Command.GET_STATUS.value)
    @Test fun `SET_EXCHANGE value`() = assertEquals(0x0007, Command.SET_EXCHANGE.value)
    @Test fun `GET_VERSION value`() = assertEquals(0x000A, Command.GET_VERSION.value)
    @Test fun `GET_SERIAL value`() = assertEquals(0x000B, Command.GET_SERIAL.value)
    @Test fun `FW_IMAGE_GET_INFO value`() = assertEquals(0x0012, Command.FW_IMAGE_GET_INFO.value)
    @Test fun `FW_SIGNATURE value`() = assertEquals(0x0101, Command.FW_SIGNATURE.value)
    @Test fun `RD_HW_CONFIG value`() = assertEquals(0x0807, Command.RD_HW_CONFIG.value)
    @Test fun `RD_VIRT_SFR value`() = assertEquals(0x0824, Command.RD_VIRT_SFR.value)
    @Test fun `WR_VIRT_SFR value`() = assertEquals(0x0825, Command.WR_VIRT_SFR.value)
    @Test fun `RD_VIRT_STRING value`() = assertEquals(0x0826, Command.RD_VIRT_STRING.value)
    @Test fun `WR_VIRT_STRING value`() = assertEquals(0x0827, Command.WR_VIRT_STRING.value)
    @Test fun `RD_VIRT_SFR_BATCH value`() = assertEquals(0x082A, Command.RD_VIRT_SFR_BATCH.value)
    @Test fun `WR_VIRT_SFR_BATCH value`() = assertEquals(0x082B, Command.WR_VIRT_SFR_BATCH.value)
    @Test fun `RD_FLASH value`() = assertEquals(0x081C, Command.RD_FLASH.value)
    @Test fun `SET_TIME value`() = assertEquals(0x0A04, Command.SET_TIME.value)

    @Test fun `entry count is 15`() = assertEquals(15, Command.values().size)

    @Test fun `all values distinct`() {
        val values = Command.values().map { it.value }
        assertEquals(values.size, values.toSet().size)
    }

    @Test fun `SET_TIME differs from GET_STATUS`() =
        assertNotEquals(Command.SET_TIME.value, Command.GET_STATUS.value)
}
