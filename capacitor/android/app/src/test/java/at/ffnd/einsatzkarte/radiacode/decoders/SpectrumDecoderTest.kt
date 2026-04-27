package at.ffnd.einsatzkarte.radiacode.decoders

import at.ffnd.einsatzkarte.radiacode.RadiaCodeException
import at.ffnd.einsatzkarte.radiacode.protocol.BytesBuffer
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Assert.fail
import org.junit.Test
import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.time.Duration

class SpectrumDecoderTest {

    // -----------------------------------------------------------------
    // Helpers
    // -----------------------------------------------------------------

    /** Build the 16-byte header `<Ifff>`: durationSeconds, a0, a1, a2. */
    private fun headerBytes(
        durationSeconds: Long,
        a0: Float,
        a1: Float,
        a2: Float,
    ): ByteArray =
        ByteBuffer.allocate(16).order(ByteOrder.LITTLE_ENDIAN)
            .putInt(durationSeconds.toInt())
            .putFloat(a0)
            .putFloat(a1)
            .putFloat(a2)
            .array()

    private fun u32leBytes(v: Int): ByteArray =
        ByteBuffer.allocate(4).order(ByteOrder.LITTLE_ENDIAN).putInt(v).array()

    private fun u16leBytes(v: Int): ByteArray =
        ByteBuffer.allocate(2).order(ByteOrder.LITTLE_ENDIAN).putShort(v.toShort()).array()

    private fun i16leBytes(v: Int): ByteArray =
        ByteBuffer.allocate(2).order(ByteOrder.LITTLE_ENDIAN).putShort(v.toShort()).array()

    private fun i32leBytes(v: Int): ByteArray =
        ByteBuffer.allocate(4).order(ByteOrder.LITTLE_ENDIAN).putInt(v).array()

    /** Build a v1 u16 run-header: top 12 bits = cnt, low 4 bits = vlen. */
    private fun runHeader(cnt: Int, vlen: Int): ByteArray =
        u16leBytes(((cnt and 0x0FFF) shl 4) or (vlen and 0x0F))

    // -----------------------------------------------------------------
    // 1: header
    // -----------------------------------------------------------------

    @Test fun `header decodes duration and a0 a1 a2 with empty counts`() {
        val data = headerBytes(60, 1.0f, 2.0f, 3.0f)
        val s = SpectrumDecoder.decode(BytesBuffer(data), formatVersion = 0)
        assertEquals(Duration.ofSeconds(60), s.duration)
        assertEquals(1.0f, s.a0, 0.0f)
        assertEquals(2.0f, s.a1, 0.0f)
        assertEquals(3.0f, s.a2, 0.0f)
        assertEquals(emptyList<Int>(), s.counts)
    }

    // -----------------------------------------------------------------
    // 2: v0 empty counts
    // -----------------------------------------------------------------

    @Test fun `v0 with no payload yields empty counts`() {
        val data = headerBytes(10, 0.0f, 0.0f, 0.0f)
        val s = SpectrumDecoder.decode(BytesBuffer(data), formatVersion = 0)
        assertEquals(emptyList<Int>(), s.counts)
    }

    // -----------------------------------------------------------------
    // 3: v0 three counts
    // -----------------------------------------------------------------

    @Test fun `v0 decodes three little-endian u32 counts`() {
        val data = headerBytes(10, 0.0f, 0.0f, 0.0f) +
            u32leBytes(100) + u32leBytes(200) + u32leBytes(300)
        val s = SpectrumDecoder.decode(BytesBuffer(data), formatVersion = 0)
        assertEquals(listOf(100, 200, 300), s.counts)
    }

    // -----------------------------------------------------------------
    // 4: v1 vlen=0 (count zero)
    // -----------------------------------------------------------------

    @Test fun `v1 vlen=0 yields cnt zeros without consuming payload`() {
        // cnt=2, vlen=0 → u16 = (2 << 4) | 0 = 0x20
        val data = headerBytes(10, 0.0f, 0.0f, 0.0f) + runHeader(cnt = 2, vlen = 0)
        val s = SpectrumDecoder.decode(BytesBuffer(data), formatVersion = 1)
        assertEquals(listOf(0, 0), s.counts)
    }

    // -----------------------------------------------------------------
    // 5: v1 vlen=1 (absolute u8 replacing last)
    // -----------------------------------------------------------------

    @Test fun `v1 vlen=1 reads absolute u8 not delta`() {
        // cnt=1, vlen=1 → u16 = (1 << 4) | 1 = 0x11
        val data = headerBytes(10, 0.0f, 0.0f, 0.0f) +
            runHeader(cnt = 1, vlen = 1) + byteArrayOf(0x42.toByte())
        val s = SpectrumDecoder.decode(BytesBuffer(data), formatVersion = 1)
        assertEquals(listOf(0x42), s.counts)
    }

    // -----------------------------------------------------------------
    // 6: v1 vlen=2 (signed i8 delta)
    // -----------------------------------------------------------------

    @Test fun `v1 vlen=2 applies signed i8 delta to last`() {
        // First load last=10 via vlen=1, then apply -1 delta → 9.
        val data = headerBytes(10, 0.0f, 0.0f, 0.0f) +
            runHeader(cnt = 1, vlen = 1) + byteArrayOf(10.toByte()) +
            runHeader(cnt = 1, vlen = 2) + byteArrayOf(0xFF.toByte())  // -1
        val s = SpectrumDecoder.decode(BytesBuffer(data), formatVersion = 1)
        assertEquals(listOf(10, 9), s.counts)
    }

    // -----------------------------------------------------------------
    // 7: v1 vlen=3 (signed i16 delta)
    // -----------------------------------------------------------------

    @Test fun `v1 vlen=3 applies signed i16 delta to last`() {
        // last=300 (via vlen=3 first, last starts at 0 so delta=300 yields last=300),
        // then delta=-256 → 44.
        val data = headerBytes(10, 0.0f, 0.0f, 0.0f) +
            runHeader(cnt = 1, vlen = 3) + i16leBytes(300) +
            runHeader(cnt = 1, vlen = 3) + i16leBytes(-256)
        val s = SpectrumDecoder.decode(BytesBuffer(data), formatVersion = 1)
        assertEquals(listOf(300, 44), s.counts)
    }

    // -----------------------------------------------------------------
    // 8: v1 vlen=4 (24-bit signed delta, three patterns)
    // -----------------------------------------------------------------

    @Test fun `v1 vlen=4 positive delta plus 1 from last 0`() {
        // a=0x01, b=0x00, c=0x00 → +1 from last=0 → 1
        val data = headerBytes(10, 0.0f, 0.0f, 0.0f) +
            runHeader(cnt = 1, vlen = 4) + byteArrayOf(0x01, 0x00, 0x00)
        val s = SpectrumDecoder.decode(BytesBuffer(data), formatVersion = 1)
        assertEquals(listOf(1), s.counts)
    }

    @Test fun `v1 vlen=4 negative delta from signed top byte`() {
        // Build last=70000 with vlen=5 (i32 delta), then apply
        // a=0x00, b=0x00, c=0xFF (= -65536, c is signed) → 70000 + (-65536) = 4464.
        val data = headerBytes(10, 0.0f, 0.0f, 0.0f) +
            runHeader(cnt = 1, vlen = 5) + i32leBytes(70000) +
            runHeader(cnt = 1, vlen = 4) + byteArrayOf(0x00, 0x00, 0xFF.toByte())
        val s = SpectrumDecoder.decode(BytesBuffer(data), formatVersion = 1)
        assertEquals(listOf(70000, 4464), s.counts)
    }

    @Test fun `v1 vlen=4 mixed bytes encode positive 24-bit delta`() {
        // a=0xAB, b=0xCD, c=0x12 → 0x12CDAB = 1_232_299 from last=0 → 1_232_299.
        // (The task plan stated 1_232_811 but 0x12CDAB == 1_232_299 — confirmed
        // via 18*65536 + 205*256 + 171.)
        val data = headerBytes(10, 0.0f, 0.0f, 0.0f) +
            runHeader(cnt = 1, vlen = 4) + byteArrayOf(0xAB.toByte(), 0xCD.toByte(), 0x12)
        val s = SpectrumDecoder.decode(BytesBuffer(data), formatVersion = 1)
        assertEquals(listOf(1_232_299), s.counts)
    }

    // -----------------------------------------------------------------
    // 9: v1 vlen=5 (signed i32 delta)
    // -----------------------------------------------------------------

    @Test fun `v1 vlen=5 applies signed i32 delta to last`() {
        // last=2000 via vlen=5, then delta=-1000 → 1000
        val data = headerBytes(10, 0.0f, 0.0f, 0.0f) +
            runHeader(cnt = 1, vlen = 5) + i32leBytes(2000) +
            runHeader(cnt = 1, vlen = 5) + i32leBytes(-1000)
        val s = SpectrumDecoder.decode(BytesBuffer(data), formatVersion = 1)
        assertEquals(listOf(2000, 1000), s.counts)
    }

    // -----------------------------------------------------------------
    // 10: v1 vlen >= 6 throws IllegalArgumentException
    // -----------------------------------------------------------------

    @Test fun `v1 vlen=6 throws IllegalArgumentException with vlen in message`() {
        val data = headerBytes(10, 0.0f, 0.0f, 0.0f) +
            runHeader(cnt = 1, vlen = 6)
        try {
            SpectrumDecoder.decode(BytesBuffer(data), formatVersion = 1)
            fail("expected IllegalArgumentException for vlen=6")
        } catch (e: IllegalArgumentException) {
            assertTrue(
                "expected vlen=6 in message, got: ${e.message}",
                e.message?.contains("6") == true,
            )
        }
    }

    // -----------------------------------------------------------------
    // 11: invalid format-version
    // -----------------------------------------------------------------

    @Test fun `formatVersion 2 throws UnsupportedSpectrumFormatVersion`() {
        val data = headerBytes(10, 0.0f, 0.0f, 0.0f)
        try {
            SpectrumDecoder.decode(BytesBuffer(data), formatVersion = 2)
            fail("expected RadiaCodeException.UnsupportedSpectrumFormatVersion")
        } catch (e: RadiaCodeException.UnsupportedSpectrumFormatVersion) {
            assertTrue(
                "expected '2' in message, got: ${e.message}",
                e.message?.contains("2") == true,
            )
        }
    }

    // -----------------------------------------------------------------
    // 12: v1 mixed run – integration test
    // -----------------------------------------------------------------

    @Test fun `v1 mixed run with multiple u16 headers and varying vlen`() {
        // Run 1: cnt=2, vlen=0 → [0, 0], last unchanged (0)
        // Run 2: cnt=1, vlen=1 (absolute u8=50) → [50], last=50
        // Run 3: cnt=2, vlen=2 (i8 deltas: +5, -10) → [55, 45], last=45
        // Run 4: cnt=1, vlen=3 (i16 delta: +1000) → [1045], last=1045
        // Run 5: cnt=1, vlen=4 (a=0x01,b=0x00,c=0x00 → +1) → [1046], last=1046
        // Run 6: cnt=1, vlen=5 (i32 delta: -1000) → [46], last=46
        val data = headerBytes(120, 0.5f, 1.5f, 2.5f) +
            runHeader(cnt = 2, vlen = 0) +
            runHeader(cnt = 1, vlen = 1) + byteArrayOf(50.toByte()) +
            runHeader(cnt = 2, vlen = 2) + byteArrayOf(0x05, 0xF6.toByte()) + // +5, -10
            runHeader(cnt = 1, vlen = 3) + i16leBytes(1000) +
            runHeader(cnt = 1, vlen = 4) + byteArrayOf(0x01, 0x00, 0x00) +
            runHeader(cnt = 1, vlen = 5) + i32leBytes(-1000)
        val s = SpectrumDecoder.decode(BytesBuffer(data), formatVersion = 1)
        assertEquals(Duration.ofSeconds(120), s.duration)
        assertEquals(0.5f, s.a0, 0.0f)
        assertEquals(1.5f, s.a1, 0.0f)
        assertEquals(2.5f, s.a2, 0.0f)
        assertEquals(listOf(0, 0, 50, 55, 45, 1045, 1046, 46), s.counts)
    }
}
