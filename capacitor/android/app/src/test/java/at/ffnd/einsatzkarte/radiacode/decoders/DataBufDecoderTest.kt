package at.ffnd.einsatzkarte.radiacode.decoders

import at.ffnd.einsatzkarte.radiacode.protocol.BytesBuffer
import at.ffnd.einsatzkarte.radiacode.types.EventId
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Assert.fail
import org.junit.Test
import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.time.Instant

class DataBufDecoderTest {

    private val baseTime: Instant = Instant.parse("2024-01-01T00:00:00Z")

    @After
    fun tearDown() {
        // Reset the internal logger to a no-op so other tests don't pull android.util.Log.
        logger = noopLogger
    }

    // -----------------------------------------------------------------
    // Helpers
    // -----------------------------------------------------------------

    /** Build a record: 7-byte header (BBBi LE) + payload. */
    private fun rec(
        seq: Int,
        eid: Int,
        gid: Int,
        tsOffset: Int,
        payload: ByteArray,
    ): ByteArray =
        ByteBuffer.allocate(7 + payload.size)
            .order(ByteOrder.LITTLE_ENDIAN)
            .put((seq and 0xFF).toByte())
            .put((eid and 0xFF).toByte())
            .put((gid and 0xFF).toByte())
            .putInt(tsOffset)
            .put(payload)
            .array()

    private fun ByteBuffer.le(): ByteBuffer = this.order(ByteOrder.LITTLE_ENDIAN)

    private fun bytes(builder: ByteBuffer.() -> Unit, capacity: Int): ByteArray {
        val bb = ByteBuffer.allocate(capacity).le()
        bb.builder()
        return bb.array()
    }

    // payload helpers
    private fun payloadFFHHHB(
        countRate: Float,
        doseRate: Float,
        countRateErr: Int,
        doseRateErr: Int,
        flags: Int,
        rtFlags: Int,
    ): ByteArray = bytes({
        putFloat(countRate)
        putFloat(doseRate)
        putShort(countRateErr.toShort())
        putShort(doseRateErr.toShort())
        putShort(flags.toShort())
        put(rtFlags.toByte())
    }, 15)

    private fun payloadFF(countRate: Float, doseRate: Float): ByteArray = bytes({
        putFloat(countRate)
        putFloat(doseRate)
    }, 8)

    private fun payloadIffHH(
        count: Long,
        countRate: Float,
        doseRate: Float,
        doseRateErr: Int,
        flags: Int,
    ): ByteArray = bytes({
        putInt(count.toInt())
        putFloat(countRate)
        putFloat(doseRate)
        putShort(doseRateErr.toShort())
        putShort(flags.toShort())
    }, 16)

    private fun payloadIfHHH(
        duration: Long,
        dose: Float,
        temperatureRaw: Int,
        chargeRaw: Int,
        flags: Int,
    ): ByteArray = bytes({
        putInt(duration.toInt())
        putFloat(dose)
        putShort(temperatureRaw.toShort())
        putShort(chargeRaw.toShort())
        putShort(flags.toShort())
    }, 14)

    private fun payloadHHH(a: Int, b: Int, c: Int): ByteArray = bytes({
        putShort(a.toShort()); putShort(b.toShort()); putShort(c.toShort())
    }, 6)

    private fun payloadEvent(eventValue: Int, eventParam1: Int, flags: Int): ByteArray = bytes({
        put(eventValue.toByte())
        put(eventParam1.toByte())
        putShort(flags.toShort())
    }, 4)

    private fun payloadFH(f: Float, h: Int): ByteArray = bytes({
        putFloat(f); putShort(h.toShort())
    }, 6)

    private fun payloadHI(h: Int, i: Long): ByteArray = bytes({
        putShort(h.toShort()); putInt(i.toInt())
    }, 6)

    // -----------------------------------------------------------------
    // 1-2: empty / too-small buffers
    // -----------------------------------------------------------------

    @Test fun `empty buffer returns empty list`() {
        val out = DataBufDecoder.decode(BytesBuffer(ByteArray(0)), baseTime)
        assertEquals(0, out.size)
    }

    @Test fun `5-byte buffer (less than header) returns empty list`() {
        val out = DataBufDecoder.decode(BytesBuffer(ByteArray(5)), baseTime)
        assertEquals(0, out.size)
    }

    // -----------------------------------------------------------------
    // 3: (0,0) RealTimeData
    // -----------------------------------------------------------------

    @Test fun `(0,0) RealTimeData decodes all fields with tsOffset 10 → +100ms`() {
        val data = rec(
            seq = 0, eid = 0, gid = 0, tsOffset = 10,
            payload = payloadFFHHHB(
                countRate = 42.5f,
                doseRate = 0.0001f,
                countRateErr = 123,
                doseRateErr = 45,
                flags = 0x1234,
                rtFlags = 0x56,
            ),
        )
        val out = DataBufDecoder.decode(BytesBuffer(data), baseTime)
        assertEquals(1, out.size)
        val rt = (out[0] as DataBufRecord.RealTime).data
        assertEquals(baseTime.plusMillis(100), rt.dt)
        assertEquals(42.5f, rt.countRate, 0.0f)
        assertEquals(0.0001f, rt.doseRate, 0.0f)
        assertEquals(12.3, rt.countRateErr, 1e-9)
        assertEquals(4.5, rt.doseRateErr, 1e-9)
        assertEquals(0x1234, rt.flags)
        assertEquals(0x56, rt.realTimeFlags)
    }

    // -----------------------------------------------------------------
    // 4: (0,1) RawData
    // -----------------------------------------------------------------

    @Test fun `(0,1) RawData decodes count and dose rate`() {
        val data = rec(0, 0, 1, 5, payloadFF(7.25f, 0.5f))
        val out = DataBufDecoder.decode(BytesBuffer(data), baseTime)
        assertEquals(1, out.size)
        val raw = (out[0] as DataBufRecord.Raw).data
        assertEquals(baseTime.plusMillis(50), raw.dt)
        assertEquals(7.25f, raw.countRate, 0.0f)
        assertEquals(0.5f, raw.doseRate, 0.0f)
    }

    // -----------------------------------------------------------------
    // 5: (0,2) DoseRateDB
    // -----------------------------------------------------------------

    @Test fun `(0,2) DoseRateDB decodes count as Long and divides doseRateErr by 10`() {
        val data = rec(
            0, 0, 2, 0,
            payloadIffHH(
                count = 0xFFFF_FFFFL,  // exercises u32 → Long
                countRate = 1.5f,
                doseRate = 2.5f,
                doseRateErr = 50,
                flags = 0xABCD,
            ),
        )
        val out = DataBufDecoder.decode(BytesBuffer(data), baseTime)
        assertEquals(1, out.size)
        val db = (out[0] as DataBufRecord.DoseRate).data
        assertEquals(baseTime, db.dt)
        assertEquals(0xFFFF_FFFFL, db.count)
        assertEquals(1.5f, db.countRate, 0.0f)
        assertEquals(2.5f, db.doseRate, 0.0f)
        assertEquals(5.0, db.doseRateErr, 1e-9)
        assertEquals(0xABCD, db.flags)
    }

    // -----------------------------------------------------------------
    // 6: (0,3) RareData – temperature/charge scaling
    // -----------------------------------------------------------------

    @Test fun `(0,3) RareData scales temperature and chargeLevel correctly`() {
        val data = rec(
            0, 0, 3, 0,
            payloadIfHHH(
                duration = 3600,
                dose = 1.5f,
                temperatureRaw = 4500,   // (4500 - 2000) / 100.0 = 25.0
                chargeRaw = 8750,        // 8750 / 100.0 = 87.5
                flags = 0x55,
            ),
        )
        val out = DataBufDecoder.decode(BytesBuffer(data), baseTime)
        assertEquals(1, out.size)
        val r = (out[0] as DataBufRecord.Rare).data
        assertEquals(3600L, r.duration)
        assertEquals(1.5f, r.dose, 0.0f)
        assertEquals(25.0, r.temperature, 1e-9)
        assertEquals(87.5, r.chargeLevel, 1e-9)
        assertEquals(0x55, r.flags)
    }

    // -----------------------------------------------------------------
    // 7-9, 12-13: consume-only branches
    // -----------------------------------------------------------------

    @Test fun `(0,4) UserData consumed without record`() {
        val data = rec(0, 0, 4, 0, payloadIffHH(1L, 1.0f, 2.0f, 3, 4)) +
            rec(1, 0, 1, 0, payloadFF(9.0f, 8.0f))
        val out = DataBufDecoder.decode(BytesBuffer(data), baseTime)
        // first record consumed silently, second is parsed
        assertEquals(1, out.size)
        assertTrue(out[0] is DataBufRecord.Raw)
    }

    @Test fun `(0,5) SheduleData consumed without record`() {
        val data = rec(0, 0, 5, 0, payloadIffHH(1L, 1.0f, 2.0f, 3, 4)) +
            rec(1, 0, 1, 0, payloadFF(9.0f, 8.0f))
        val out = DataBufDecoder.decode(BytesBuffer(data), baseTime)
        assertEquals(1, out.size)
        assertTrue(out[0] is DataBufRecord.Raw)
    }

    @Test fun `(0,6) AccelData consumed without record`() {
        val data = rec(0, 0, 6, 0, payloadHHH(1, 2, 3)) +
            rec(1, 0, 1, 0, payloadFF(9.0f, 8.0f))
        val out = DataBufDecoder.decode(BytesBuffer(data), baseTime)
        assertEquals(1, out.size)
        assertTrue(out[0] is DataBufRecord.Raw)
    }

    @Test fun `(0,8) RawCountRate consumed without record`() {
        val data = rec(0, 0, 8, 0, payloadFH(1.0f, 2)) +
            rec(1, 0, 1, 0, payloadFF(9.0f, 8.0f))
        val out = DataBufDecoder.decode(BytesBuffer(data), baseTime)
        assertEquals(1, out.size)
        assertTrue(out[0] is DataBufRecord.Raw)
    }

    @Test fun `(0,9) RawDoseRate consumed without record`() {
        val data = rec(0, 0, 9, 0, payloadFH(1.0f, 2)) +
            rec(1, 0, 1, 0, payloadFF(9.0f, 8.0f))
        val out = DataBufDecoder.decode(BytesBuffer(data), baseTime)
        assertEquals(1, out.size)
        assertTrue(out[0] is DataBufRecord.Raw)
    }

    // -----------------------------------------------------------------
    // 10-11: (0,7) Event
    // -----------------------------------------------------------------

    @Test fun `(0,7) Event with USER_EVENT (5)`() {
        val data = rec(0, 0, 7, 0, payloadEvent(5, 7, 0xFFFF))
        val out = DataBufDecoder.decode(BytesBuffer(data), baseTime)
        assertEquals(1, out.size)
        val e = (out[0] as DataBufRecord.Evt).data
        assertEquals(EventId.USER_EVENT, e.event)
        assertEquals(7, e.eventParam1)
        assertEquals(0xFFFF, e.flags)
    }

    @Test fun `(0,7) Event parametrized over all EventIds`() {
        for ((idx, ev) in EventId.values().withIndex()) {
            val data = rec(0, 0, 7, 0, payloadEvent(ev.value, idx, 0))
            val out = DataBufDecoder.decode(BytesBuffer(data), baseTime)
            assertEquals("expected exactly one record for $ev", 1, out.size)
            val e = (out[0] as DataBufRecord.Evt).data
            assertEquals(ev, e.event)
            assertEquals(idx, e.eventParam1)
        }
    }

    // -----------------------------------------------------------------
    // 14-16: (1,1)/(1,2)/(1,3) skip branches
    // -----------------------------------------------------------------

    @Test fun `(1,1) skips samplesNum times 8 bytes after header`() {
        val payload = payloadHI(2, 100L) + ByteArray(2 * 8)
        val data = rec(0, 1, 1, 0, payload) +
            rec(1, 0, 1, 0, payloadFF(1.0f, 2.0f))
        val out = DataBufDecoder.decode(BytesBuffer(data), baseTime)
        assertEquals(1, out.size)
        assertTrue(out[0] is DataBufRecord.Raw)
    }

    @Test fun `(1,2) skips samplesNum times 16 bytes after header`() {
        val payload = payloadHI(3, 200L) + ByteArray(3 * 16)
        val data = rec(0, 1, 2, 0, payload) +
            rec(1, 0, 1, 0, payloadFF(1.0f, 2.0f))
        val out = DataBufDecoder.decode(BytesBuffer(data), baseTime)
        assertEquals(1, out.size)
        assertTrue(out[0] is DataBufRecord.Raw)
    }

    @Test fun `(1,3) skips samplesNum times 14 bytes after header`() {
        val payload = payloadHI(1, 300L) + ByteArray(1 * 14)
        val data = rec(0, 1, 3, 0, payload) +
            rec(1, 0, 1, 0, payloadFF(1.0f, 2.0f))
        val out = DataBufDecoder.decode(BytesBuffer(data), baseTime)
        assertEquals(1, out.size)
        assertTrue(out[0] is DataBufRecord.Raw)
    }

    // -----------------------------------------------------------------
    // 17: three sequential records 0,1,2
    // -----------------------------------------------------------------

    @Test fun `three sequential records seq 0 1 2 all returned`() {
        val data = rec(0, 0, 1, 0, payloadFF(1.0f, 2.0f)) +
            rec(1, 0, 1, 0, payloadFF(3.0f, 4.0f)) +
            rec(2, 0, 1, 0, payloadFF(5.0f, 6.0f))
        val out = DataBufDecoder.decode(BytesBuffer(data), baseTime)
        assertEquals(3, out.size)
        val a = (out[0] as DataBufRecord.Raw).data
        val b = (out[1] as DataBufRecord.Raw).data
        val c = (out[2] as DataBufRecord.Raw).data
        assertEquals(1.0f, a.countRate, 0.0f)
        assertEquals(3.0f, b.countRate, 0.0f)
        assertEquals(5.0f, c.countRate, 0.0f)
    }

    // -----------------------------------------------------------------
    // 18: sequence wraparound 254→255→0
    // -----------------------------------------------------------------

    @Test fun `sequence wraparound 254 to 255 to 0 keeps all records`() {
        val data = rec(254, 0, 1, 0, payloadFF(1.0f, 2.0f)) +
            rec(255, 0, 1, 0, payloadFF(3.0f, 4.0f)) +
            rec(0,   0, 1, 0, payloadFF(5.0f, 6.0f))
        val out = DataBufDecoder.decode(BytesBuffer(data), baseTime)
        assertEquals(3, out.size)
    }

    // -----------------------------------------------------------------
    // 19-20: sequence jump
    // -----------------------------------------------------------------

    @Test fun `seq jump with ignoreErrors=true returns previous records and breaks`() {
        val data = rec(0, 0, 1, 0, payloadFF(1.0f, 2.0f)) +
            rec(2, 0, 1, 0, payloadFF(3.0f, 4.0f))   // jump 0→2 (expected 1)
        val out = DataBufDecoder.decode(BytesBuffer(data), baseTime, ignoreErrors = true)
        assertEquals(1, out.size)
        assertEquals(1.0f, (out[0] as DataBufRecord.Raw).data.countRate, 0.0f)
    }

    @Test fun `seq jump with ignoreErrors=false returns previous records and does not throw`() {
        val data = rec(0, 0, 1, 0, payloadFF(1.0f, 2.0f)) +
            rec(2, 0, 1, 0, payloadFF(3.0f, 4.0f))
        val out = DataBufDecoder.decode(BytesBuffer(data), baseTime, ignoreErrors = false)
        assertEquals(1, out.size)
    }

    // -----------------------------------------------------------------
    // 21-22: unknown (eid,gid)
    // -----------------------------------------------------------------

    @Test fun `unknown (2,0) with ignoreErrors=true preserves prior records and breaks`() {
        val data = rec(0, 0, 1, 0, payloadFF(1.0f, 2.0f)) +
            rec(1, 2, 0, 0, ByteArray(0))
        val out = DataBufDecoder.decode(BytesBuffer(data), baseTime, ignoreErrors = true)
        assertEquals(1, out.size)
    }

    @Test fun `unknown (2,0) with ignoreErrors=false preserves prior records and breaks (no throw)`() {
        val data = rec(0, 0, 1, 0, payloadFF(1.0f, 2.0f)) +
            rec(1, 2, 0, 0, ByteArray(0))
        val out = DataBufDecoder.decode(BytesBuffer(data), baseTime, ignoreErrors = false)
        assertEquals(1, out.size)
    }

    // -----------------------------------------------------------------
    // 23-24: truncated payload
    // -----------------------------------------------------------------

    @Test fun `truncated (0,0) record with ignoreErrors=true breaks cleanly with no record`() {
        // header for (0,0) requires 15 bytes; provide 5
        val truncated = rec(0, 0, 0, 0, ByteArray(5))
        val out = DataBufDecoder.decode(BytesBuffer(truncated), baseTime, ignoreErrors = true)
        assertEquals(0, out.size)
    }

    @Test fun `truncated (0,0) record with ignoreErrors=false throws IllegalStateException`() {
        val truncated = rec(0, 0, 0, 0, ByteArray(5))
        try {
            DataBufDecoder.decode(BytesBuffer(truncated), baseTime, ignoreErrors = false)
            fail("expected IllegalStateException")
        } catch (e: IllegalStateException) {
            // expected
        }
    }

    // -----------------------------------------------------------------
    // 25-26: invalid EventId
    // -----------------------------------------------------------------

    @Test fun `(0,7) Event with invalid EventId 99 ignoreErrors=true breaks no record`() {
        val data = rec(0, 0, 7, 0, payloadEvent(99, 0, 0))
        val out = DataBufDecoder.decode(BytesBuffer(data), baseTime, ignoreErrors = true)
        assertEquals(0, out.size)
    }

    @Test fun `(0,7) Event with invalid EventId 99 ignoreErrors=false throws`() {
        val data = rec(0, 0, 7, 0, payloadEvent(99, 0, 0))
        try {
            DataBufDecoder.decode(BytesBuffer(data), baseTime, ignoreErrors = false)
            fail("expected IllegalArgumentException")
        } catch (e: IllegalArgumentException) {
            // expected
        }
    }

    // -----------------------------------------------------------------
    // 27-28: tsOffset scaling
    // -----------------------------------------------------------------

    @Test fun `tsOffset 100 yields baseTime + 1000ms`() {
        val data = rec(0, 0, 1, 100, payloadFF(0.0f, 0.0f))
        val out = DataBufDecoder.decode(BytesBuffer(data), baseTime)
        assertEquals(baseTime.plusMillis(1000), (out[0] as DataBufRecord.Raw).data.dt)
    }

    @Test fun `tsOffset -50 yields baseTime - 500ms (signed)`() {
        val data = rec(0, 0, 1, -50, payloadFF(0.0f, 0.0f))
        val out = DataBufDecoder.decode(BytesBuffer(data), baseTime)
        assertEquals(baseTime.minusMillis(500), (out[0] as DataBufRecord.Raw).data.dt)
    }

    // -----------------------------------------------------------------
    // 29: logger isolation – capturing logger sees "seq jump"
    // -----------------------------------------------------------------

    @Test fun `capturing logger receives seq jump message`() {
        val captured = mutableListOf<String>()
        logger = { captured.add(it) }

        val data = rec(0, 0, 1, 0, payloadFF(1.0f, 2.0f)) +
            rec(2, 0, 1, 0, payloadFF(3.0f, 4.0f))
        DataBufDecoder.decode(BytesBuffer(data), baseTime, ignoreErrors = false)

        assertTrue(
            "expected a 'seq jump' message in captured logs, got: $captured",
            captured.any { it.contains("seq jump") },
        )
    }
}

// A reusable no-op logger reference so the @After tearDown can reset state without
// touching android.util.Log on the JVM-only test classpath.
private val noopLogger: (String) -> Unit = { /* no-op */ }
