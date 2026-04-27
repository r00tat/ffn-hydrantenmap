package at.ffnd.einsatzkarte.radiacode.protocol

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Tests for [VsfrFormat] decoders.
 *
 * Each test mirrors the Python `struct.unpack(<fmt>, struct.pack('<I', v))`
 * semantics on a 32-bit little-endian payload.
 */
class VsfrFormatTest {

    @Test
    fun `U32 decodes positive value as Int`() {
        assertEquals(1, VsfrFormat.U32.decode(0x00000001))
    }

    @Test
    fun `U32 decodes 0xFFFFFFFF as -1 Int (caller treats as unsigned)`() {
        // 0xFFFFFFFF as signed Int is -1; caller may treat as Long when needed.
        assertEquals(0xFFFFFFFF.toInt(), VsfrFormat.U32.decode(0xFFFFFFFF.toInt()))
    }

    @Test
    fun `I32 decodes 0xFFFFFFFF as -1`() {
        assertEquals(-1, VsfrFormat.I32.decode(0xFFFFFFFF.toInt()))
    }

    @Test
    fun `I32 decodes 0x80000000 as Int MIN_VALUE`() {
        assertEquals(Int.MIN_VALUE, VsfrFormat.I32.decode(0x80000000.toInt()))
    }

    @Test
    fun `F32 roundtrips 3_1415927f via fromBits`() {
        val v = 3.1415927f
        val bits = java.lang.Float.floatToRawIntBits(v)
        assertEquals(v, VsfrFormat.F32.decode(bits))
    }

    @Test
    fun `ThreeXBool returns true when top byte is 0x01`() {
        // little-endian bytes: 00 00 00 01 → top byte (4th LE byte) = 0x01
        assertEquals(true, VsfrFormat.ThreeXBool.decode(0x01000000))
    }

    @Test
    fun `ThreeXBool returns false when top byte is 0x00`() {
        // little-endian bytes: FF FF FF 00 → top byte (4th LE byte) = 0x00
        assertEquals(false, VsfrFormat.ThreeXBool.decode(0x00FFFFFF))
    }

    @Test
    fun `ThreeXByte extracts top byte 0xAB`() {
        assertEquals(0xAB, VsfrFormat.ThreeXByte.decode(0xAB000000.toInt()))
    }

    @Test
    fun `ThreeXByte returns 0 for 0x00000000`() {
        assertEquals(0, VsfrFormat.ThreeXByte.decode(0x00000000))
    }

    @Test
    fun `TwoXShort sign-extends 0xFFFF top short to -1`() {
        assertEquals(-1, VsfrFormat.TwoXShort.decode(0xFFFF0000.toInt()))
    }

    @Test
    fun `TwoXShort decodes 0x7FFF top short as 32767`() {
        assertEquals(0x7FFF, VsfrFormat.TwoXShort.decode(0x7FFF0000))
    }

    @Test
    fun `TwoXUShort decodes 0xFFFF top short as 65535`() {
        assertEquals(0xFFFF, VsfrFormat.TwoXUShort.decode(0xFFFF0000.toInt()))
    }

    @Test
    fun `TwoXUShort decodes 0x8000 top short as 32768 unsigned`() {
        assertEquals(0x8000, VsfrFormat.TwoXUShort.decode(0x80000000.toInt()))
    }

    @Test
    fun `ThreeXBool truthy bit anywhere in top byte returns true`() {
        // Any non-zero bit in the top byte should be true
        assertTrue(VsfrFormat.ThreeXBool.decode(0x80000000.toInt()) as Boolean)
        assertFalse(VsfrFormat.ThreeXBool.decode(0x00FFFFFF) as Boolean)
    }
}
