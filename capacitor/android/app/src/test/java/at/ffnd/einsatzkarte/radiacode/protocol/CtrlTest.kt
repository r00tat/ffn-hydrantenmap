package at.ffnd.einsatzkarte.radiacode.protocol

import org.junit.Assert.assertEquals
import org.junit.Test

class CtrlTest {
    @Test fun `BUTTONS mask`() = assertEquals(0x01, Ctrl.BUTTONS.mask)
    @Test fun `CLICKS mask`() = assertEquals(0x02, Ctrl.CLICKS.mask)
    @Test fun `DOSE_RATE_ALARM_1 mask`() = assertEquals(0x04, Ctrl.DOSE_RATE_ALARM_1.mask)
    @Test fun `DOSE_RATE_ALARM_2 mask`() = assertEquals(0x08, Ctrl.DOSE_RATE_ALARM_2.mask)
    @Test fun `DOSE_RATE_OUT_OF_SCALE mask`() = assertEquals(0x10, Ctrl.DOSE_RATE_OUT_OF_SCALE.mask)
    @Test fun `DOSE_ALARM_1 mask`() = assertEquals(0x20, Ctrl.DOSE_ALARM_1.mask)
    @Test fun `DOSE_ALARM_2 mask`() = assertEquals(0x40, Ctrl.DOSE_ALARM_2.mask)
    @Test fun `DOSE_OUT_OF_SCALE mask`() = assertEquals(0x80, Ctrl.DOSE_OUT_OF_SCALE.mask)

    @Test fun `entry count is 8`() = assertEquals(8, Ctrl.values().size)

    @Test fun `all masks distinct`() {
        val masks = Ctrl.values().map { it.mask }
        assertEquals(masks.size, masks.toSet().size)
    }
}
