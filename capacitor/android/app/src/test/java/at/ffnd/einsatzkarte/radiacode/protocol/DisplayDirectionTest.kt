package at.ffnd.einsatzkarte.radiacode.protocol

import org.junit.Assert.assertEquals
import org.junit.Test

class DisplayDirectionTest {
    @Test fun `AUTO is 0`() = assertEquals(0, DisplayDirection.AUTO.value)
    @Test fun `RIGHT is 1`() = assertEquals(1, DisplayDirection.RIGHT.value)
    @Test fun `LEFT is 2`() = assertEquals(2, DisplayDirection.LEFT.value)

    @Test fun `entry count is 3`() = assertEquals(3, DisplayDirection.values().size)
}
