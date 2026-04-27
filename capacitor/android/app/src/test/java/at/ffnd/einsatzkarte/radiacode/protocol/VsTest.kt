package at.ffnd.einsatzkarte.radiacode.protocol

import org.junit.Assert.assertEquals
import org.junit.Test

class VsTest {
    @Test fun `CONFIGURATION value`() = assertEquals(2, Vs.CONFIGURATION.value)
    @Test fun `FW_DESCRIPTOR value`() = assertEquals(3, Vs.FW_DESCRIPTOR.value)
    @Test fun `SERIAL_NUMBER value`() = assertEquals(8, Vs.SERIAL_NUMBER.value)
    @Test fun `TEXT_MESSAGE value`() = assertEquals(0xF, Vs.TEXT_MESSAGE.value)
    @Test fun `MEM_SNAPSHOT value`() = assertEquals(0xE0, Vs.MEM_SNAPSHOT.value)
    @Test fun `DATA_BUF value`() = assertEquals(0x100, Vs.DATA_BUF.value)
    @Test fun `SFR_FILE value`() = assertEquals(0x101, Vs.SFR_FILE.value)
    @Test fun `SPECTRUM value`() = assertEquals(0x200, Vs.SPECTRUM.value)
    @Test fun `ENERGY_CALIB value`() = assertEquals(0x202, Vs.ENERGY_CALIB.value)
    @Test fun `SPEC_ACCUM value`() = assertEquals(0x205, Vs.SPEC_ACCUM.value)
    @Test fun `SPEC_DIFF value`() = assertEquals(0x206, Vs.SPEC_DIFF.value)
    @Test fun `SPEC_RESET value`() = assertEquals(0x207, Vs.SPEC_RESET.value)

    @Test fun `entry count is 12`() = assertEquals(12, Vs.values().size)

    @Test fun `all values distinct`() {
        val values = Vs.values().map { it.value }
        assertEquals(values.size, values.toSet().size)
    }
}
