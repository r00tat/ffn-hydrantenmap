package at.ffnd.einsatzkarte.radiacode.protocol

import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertTrue
import org.junit.Assert.fail
import org.junit.Test

class BytesBufferTest {

    private fun bytes(vararg values: Int): ByteArray =
        ByteArray(values.size) { values[it].toByte() }

    @Test fun `empty buffer reports size zero, empty remaining, and u8 throws`() {
        val buf = BytesBuffer(ByteArray(0))
        assertEquals(0, buf.size())
        assertArrayEquals(ByteArray(0), buf.remaining())
        try {
            buf.u8()
            fail("expected IllegalStateException")
        } catch (e: IllegalStateException) {
            // expected
        }
    }

    @Test fun `multiple sequential reads track position`() {
        val buf = BytesBuffer(bytes(0x01, 0x02, 0x03, 0x04))
        assertEquals(4, buf.size())
        assertEquals(1, buf.u8())
        assertEquals(3, buf.size())
        assertEquals(2, buf.u8())
        assertEquals(2, buf.size())
        assertEquals(3, buf.u8())
        assertEquals(1, buf.size())
        assertEquals(4, buf.u8())
        assertEquals(0, buf.size())
    }

    @Test fun `u8 boundary values`() {
        val buf = BytesBuffer(bytes(0x00, 0xFF))
        assertEquals(0, buf.u8())
        assertEquals(255, buf.u8())
    }

    @Test fun `i8 boundary values`() {
        val buf = BytesBuffer(bytes(0x00, 0xFF, 0x80, 0x7F))
        assertEquals(0, buf.i8())
        assertEquals(-1, buf.i8())
        assertEquals(-128, buf.i8())
        assertEquals(127, buf.i8())
    }

    @Test fun `u16Le decodes little-endian unsigned 16 bit values`() {
        val buf = BytesBuffer(bytes(0xFF, 0xFF, 0x34, 0x12))
        assertEquals(65535, buf.u16Le())
        assertEquals(0x1234, buf.u16Le())
    }

    @Test fun `i16Le decodes little-endian signed 16 bit values`() {
        val buf = BytesBuffer(bytes(0xFF, 0xFF, 0x00, 0x80))
        assertEquals(-1, buf.i16Le())
        assertEquals(-32768, buf.i16Le())
    }

    @Test fun `u32Le decodes little-endian unsigned 32 bit values`() {
        val buf = BytesBuffer(bytes(0xFF, 0xFF, 0xFF, 0xFF, 0x78, 0x56, 0x34, 0x12))
        assertEquals(4_294_967_295L, buf.u32Le())
        assertEquals(0x12345678L, buf.u32Le())
    }

    @Test fun `i32Le decodes little-endian signed 32 bit values`() {
        val buf = BytesBuffer(bytes(0xFF, 0xFF, 0xFF, 0xFF, 0x00, 0x00, 0x00, 0x80))
        assertEquals(-1, buf.i32Le())
        assertEquals(Int.MIN_VALUE, buf.i32Le())
    }

    @Test fun `f32Le decodes IEEE-754 single precision little-endian`() {
        // 0x40490FDB → ~3.14159f
        val buf = BytesBuffer(bytes(0xDB, 0x0F, 0x49, 0x40))
        assertEquals(Float.fromBits(0x40490FDB.toInt()), buf.f32Le(), 0f)
        // sanity check
        val buf2 = BytesBuffer(bytes(0xDB, 0x0F, 0x49, 0x40))
        assertEquals(3.14159f, buf2.f32Le(), 1e-4f)
    }

    @Test fun `f64Le decodes IEEE-754 double precision little-endian`() {
        // 1.0 == 0x3FF0000000000000 → LE bytes
        val buf = BytesBuffer(bytes(0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0xF0, 0x3F))
        assertEquals(1.0, buf.f64Le(), 0.0)
    }

    @Test fun `bool reads zero as false and any non-zero as true`() {
        val buf = BytesBuffer(bytes(0x00, 0x01, 0x7F, 0xFF))
        assertFalse(buf.bool())
        assertTrue(buf.bool())
        assertTrue(buf.bool())
        assertTrue(buf.bool())
    }

    @Test fun `skip advances position and skip zero is a no-op`() {
        val buf = BytesBuffer(bytes(0x01, 0x02, 0x03, 0x04, 0x05))
        buf.skip(0)
        assertEquals(5, buf.size())
        buf.skip(2)
        assertEquals(3, buf.size())
        assertEquals(0x03, buf.u8())
    }

    @Test fun `skip beyond size throws IllegalStateException`() {
        val buf = BytesBuffer(bytes(0x01, 0x02))
        try {
            buf.skip(3)
            fail("expected IllegalStateException")
        } catch (e: IllegalStateException) {
            // expected
        }
    }

    @Test fun `bytes returns a copy not a view`() {
        val buf = BytesBuffer(bytes(0xAA, 0xBB, 0xCC, 0xDD))
        val copy = buf.bytes(2)
        assertArrayEquals(bytes(0xAA, 0xBB), copy)
        // mutate the returned array
        copy[0] = 0x00
        copy[1] = 0x00
        // next read must still see the original following bytes
        assertEquals(0xCC, buf.u8())
        assertEquals(0xDD, buf.u8())
    }

    @Test fun `bytes with n exceeding size throws IllegalStateException`() {
        val buf = BytesBuffer(bytes(0x01, 0x02))
        try {
            buf.bytes(3)
            fail("expected IllegalStateException")
        } catch (e: IllegalStateException) {
            // expected
        }
    }

    @Test fun `unpackString length zero returns empty string and consumes one byte`() {
        val buf = BytesBuffer(bytes(0x00, 0xAB))
        assertEquals("", buf.unpackString())
        assertEquals(1, buf.size())
        assertEquals(0xAB, buf.u8())
    }

    @Test fun `unpackString length five returns ascii hello and consumes six bytes`() {
        // 'h','e','l','l','o' = 0x68 0x65 0x6C 0x6C 0x6F
        val buf = BytesBuffer(bytes(0x05, 0x68, 0x65, 0x6C, 0x6C, 0x6F, 0x99))
        assertEquals("hello", buf.unpackString())
        assertEquals(1, buf.size())
        assertEquals(0x99, buf.u8())
    }

    @Test fun `unpackString consumes entire remaining buffer`() {
        val buf = BytesBuffer(bytes(0x03, 0x41, 0x42, 0x43))
        assertEquals("ABC", buf.unpackString())
        assertEquals(0, buf.size())
    }

    @Test fun `unpackString with insufficient payload throws and rolls back position`() {
        // length byte = 5, but only 2 payload bytes follow
        val buf = BytesBuffer(bytes(0x05, 0x41, 0x42))
        try {
            buf.unpackString()
            fail("expected IllegalStateException")
        } catch (e: IllegalStateException) {
            // expected
        }
        // position must still be at the length byte
        assertEquals(3, buf.size())
        assertEquals(5, buf.u8())
    }

    @Test fun `remaining returns only unread bytes and is a copy`() {
        val buf = BytesBuffer(bytes(0x01, 0x02, 0x03, 0x04, 0x05))
        buf.skip(2)
        val rem = buf.remaining()
        assertArrayEquals(bytes(0x03, 0x04, 0x05), rem)
        rem[0] = 0x00
        // next read must still see the original byte
        assertEquals(0x03, buf.u8())
        // remaining must not have advanced position
        assertNotEquals(rem.size, buf.size())
    }

    @Test fun `under-read u32Le on three byte buffer throws and does not advance`() {
        val buf = BytesBuffer(bytes(0x01, 0x02, 0x03))
        try {
            buf.u32Le()
            fail("expected IllegalStateException")
        } catch (e: IllegalStateException) {
            // expected
        }
        assertEquals(3, buf.size())
        assertEquals(0x01, buf.u8())
    }
}
