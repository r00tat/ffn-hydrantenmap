package at.ffnd.einsatzkarte.radiacode.protocol

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class VsfrTest {
    @Test fun `DEVICE_CTRL value and format`() {
        assertEquals(0x0500, Vsfr.DEVICE_CTRL.value)
        assertEquals("3xB", Vsfr.DEVICE_CTRL.format)
    }

    @Test fun `DEVICE_TIME value and format`() {
        assertEquals(0x0504, Vsfr.DEVICE_TIME.value)
        assertEquals("I", Vsfr.DEVICE_TIME.format)
    }

    @Test fun `CHN_TO_keV_A0 value and format`() {
        assertEquals(0x8010, Vsfr.CHN_TO_keV_A0.value)
        assertEquals("f", Vsfr.CHN_TO_keV_A0.format)
    }

    @Test fun `SYS_MCU_ID0 value and format`() {
        assertEquals(0xFFFF0000.toInt(), Vsfr.SYS_MCU_ID0.value)
        assertEquals("I", Vsfr.SYS_MCU_ID0.format)
    }

    @Test fun `SYS_FW_VER_BT keeps Python literal 0xFFFF010 and has no format`() {
        assertEquals(0xFFFF010, Vsfr.SYS_FW_VER_BT.value)
        assertNull(Vsfr.SYS_FW_VER_BT.format)
    }

    @Test fun `PLAY_SIGNAL value and format`() {
        assertEquals(0x05E1, Vsfr.PLAY_SIGNAL.value)
        assertEquals("3xB", Vsfr.PLAY_SIGNAL.format)
    }

    @Test fun `LED0_BRT has no format`() = assertNull(Vsfr.LED0_BRT.format)
    @Test fun `MS_CTRL has no format`() = assertNull(Vsfr.MS_CTRL.format)
    @Test fun `MS_MODE has no format`() = assertNull(Vsfr.MS_MODE.format)
    @Test fun `MS_SUB_MODE has no format`() = assertNull(Vsfr.MS_SUB_MODE.format)
    @Test fun `LEDS_ON has no format`() = assertNull(Vsfr.LEDS_ON.format)

    @Test fun `all values are unique`() {
        val values = Vsfr.values().map { it.value }
        assertEquals(values.size, values.toSet().size)
    }

    @Test fun `SYS_MCU_VREF format is signed i`() {
        assertEquals(0xFFFF000C.toInt(), Vsfr.SYS_MCU_VREF.value)
        assertEquals("i", Vsfr.SYS_MCU_VREF.format)
    }

    @Test fun `ACC_X format`() {
        assertEquals(0x8025, Vsfr.ACC_X.value)
        assertEquals("2xh", Vsfr.ACC_X.format)
    }
}
