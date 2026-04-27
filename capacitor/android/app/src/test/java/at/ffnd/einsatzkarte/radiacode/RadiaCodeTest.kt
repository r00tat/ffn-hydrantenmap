package at.ffnd.einsatzkarte.radiacode

import at.ffnd.einsatzkarte.radiacode.decoders.DataBufRecord
import at.ffnd.einsatzkarte.radiacode.protocol.Command
import at.ffnd.einsatzkarte.radiacode.protocol.Ctrl
import at.ffnd.einsatzkarte.radiacode.protocol.DisplayDirection
import at.ffnd.einsatzkarte.radiacode.protocol.Vs
import at.ffnd.einsatzkarte.radiacode.protocol.Vsfr
import at.ffnd.einsatzkarte.radiacode.transport.FakeTransport
import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Assert.fail
import org.junit.Test
import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.nio.charset.Charset
import java.time.Instant
import java.time.temporal.ChronoUnit

/**
 * Unit tests for [RadiaCode]. Uses [FakeTransport] for in-memory request/response
 * scripting; no real Bluetooth stack involved.
 *
 * Wire-format conventions (see [RadiaCode.execute]):
 *  - Each request sent on the wire is `<I>(payload-len) <HBB>(cmd, 0, seq) <args>`.
 *  - Each response delivered by the transport (FakeTransport simulates this) is
 *    `<HBB>(cmd, 0, seq)` echo header followed by the response body.
 *  - `seq` for the n-th request issued by RadiaCode is `0x80 + (n mod 32)`.
 */
class RadiaCodeTest {
    // ---- helpers ----------------------------------------------------------

    private fun u32le(v: Int): ByteArray =
        ByteBuffer.allocate(4).order(ByteOrder.LITTLE_ENDIAN).putInt(v).array()

    private fun u32le(v: Long): ByteArray =
        ByteBuffer.allocate(4).order(ByteOrder.LITTLE_ENDIAN).putInt(v.toInt()).array()

    private fun u16le(v: Int): ByteArray =
        ByteBuffer.allocate(2).order(ByteOrder.LITTLE_ENDIAN).putShort(v.toShort()).array()

    private fun f32le(v: Float): ByteArray =
        ByteBuffer.allocate(4).order(ByteOrder.LITTLE_ENDIAN).putFloat(v).array()

    private fun lengthPrefixed(s: String): ByteArray {
        val bytes = s.toByteArray(Charsets.US_ASCII)
        return byteArrayOf(bytes.size.toByte()) + bytes
    }

    /** Wire shape of a request that RadiaCode.execute would build. */
    private fun expectedRequest(cmd: Int, seqIndex: Int, args: ByteArray = ByteArray(0)): ByteArray {
        val seqByte = (0x80 + seqIndex).toByte()
        val header = byteArrayOf((cmd and 0xFF).toByte(), ((cmd ushr 8) and 0xFF).toByte(), 0, seqByte)
        val payload = header + args
        return u32le(payload.size) + payload
    }

    /** Reads cmd_u16 (offset 4-5 after the 4-byte length prefix) from a captured request. */
    private fun cmdAt(req: ByteArray): Int =
        (req[4].toInt() and 0xFF) or ((req[5].toInt() and 0xFF) shl 8)

    /** Reads the seq byte (offset 7 after length prefix + cmd_u16 + reserved). */
    private fun seqAt(req: ByteArray): Int = req[7].toInt() and 0xFF

    /** Reads the args portion (after the 8-byte framed header) of a captured request. */
    private fun argsOf(req: ByteArray): ByteArray = req.copyOfRange(8, req.size)

    /**
     * Builds a RadiaCode with a FakeTransport pre-stocked for the 5-step init sequence:
     *  seq=0: SET_EXCHANGE        → response = empty body
     *  seq=1: SET_TIME            → empty
     *  seq=2: WR_VIRT_SFR (DEVICE_TIME=0) → retcode=1 (4 bytes)
     *  seq=3: GET_VERSION         → boot/target version blocks
     *  seq=4: RD_VIRT_STRING(CONFIGURATION) → retcode=1, flen, cp1251 bytes
     *
     * After init, the next request will use seqIndex=5.
     */
    private fun setupRadiaCode(
        transport: FakeTransport,
        bootMajor: Int = 4, bootMinor: Int = 8, bootDate: String = "Jan 1 2024",
        targetMajor: Int = 4, targetMinor: Int = 8, targetDate: String = "Jan 2 2024",
        configuration: String = "DeviceName=RC-103\nSpecFormatVersion=1\nFooBar=baz",
        ignoreFirmwareCheck: Boolean = false,
    ): RadiaCode {
        transport.enqueueResponseFor(Command.SET_EXCHANGE.value, 0x80 + 0)
        transport.enqueueResponseFor(Command.SET_TIME.value, 0x80 + 1)
        transport.enqueueResponseFor(Command.WR_VIRT_SFR.value, 0x80 + 2, payload = u32le(1))
        val versionPayload = u16le(bootMinor) + u16le(bootMajor) + lengthPrefixed(bootDate) +
            u16le(targetMinor) + u16le(targetMajor) + lengthPrefixed(targetDate)
        transport.enqueueResponseFor(Command.GET_VERSION.value, 0x80 + 3, payload = versionPayload)
        val configBytes = configuration.toByteArray(Charset.forName("windows-1251"))
        transport.enqueueResponseFor(
            Command.RD_VIRT_STRING.value, 0x80 + 4,
            payload = u32le(1) + u32le(configBytes.size) + configBytes,
        )
        return RadiaCode(transport, ignoreFirmwareCompatibilityCheck = ignoreFirmwareCheck)
    }

    // =====================================================================
    // Init-flow tests
    // =====================================================================

    @Test
    fun `init runs SET_EXCHANGE SET_TIME DEVICE_TIME GET_VERSION CONFIGURATION in order`() {
        val ft = FakeTransport()
        setupRadiaCode(ft)
        assertEquals(5, ft.requests.size)
        assertEquals(Command.SET_EXCHANGE.value, cmdAt(ft.requests[0]))
        assertEquals(Command.SET_TIME.value, cmdAt(ft.requests[1]))
        assertEquals(Command.WR_VIRT_SFR.value, cmdAt(ft.requests[2]))
        assertEquals(Command.GET_VERSION.value, cmdAt(ft.requests[3]))
        assertEquals(Command.RD_VIRT_STRING.value, cmdAt(ft.requests[4]))
    }

    @Test
    fun `init sends SET_EXCHANGE with magic args 01 FF 12 FF`() {
        val ft = FakeTransport()
        setupRadiaCode(ft)
        val args = argsOf(ft.requests[0])
        assertArrayEquals(byteArrayOf(0x01, 0xFF.toByte(), 0x12, 0xFF.toByte()), args)
    }

    @Test
    fun `init writes DEVICE_TIME=0`() {
        val ft = FakeTransport()
        setupRadiaCode(ft)
        // WR_VIRT_SFR payload: <I>(VSFR.DEVICE_TIME) + <I>(0)
        val args = argsOf(ft.requests[2])
        assertArrayEquals(u32le(Vsfr.DEVICE_TIME.value) + u32le(0), args)
    }

    @Test
    fun `init parses SpecFormatVersion=1`() {
        val ft = FakeTransport()
        val rc = setupRadiaCode(ft, configuration = "Other=x\nSpecFormatVersion=1\nMore=y")
        // Verify by issuing a spectrum read and checking that the SpectrumDecoder for v1 is used.
        // We check this indirectly: a v1 spectrum payload with no count entries should decode cleanly.
        val spectrumBody = u32le(0) + f32le(0f) + f32le(1f) + f32le(0f) // duration=0, a0/a1/a2
        ft.enqueueResponseFor(
            Command.RD_VIRT_STRING.value, 0x80 + 5,
            payload = u32le(1) + u32le(spectrumBody.size) + spectrumBody,
        )
        val spec = rc.spectrum()
        assertEquals(0L, spec.duration.seconds)
        assertEquals(0, spec.counts.size)
    }

    @Test
    fun `init defaults to SpecFormatVersion=0 when missing`() {
        val ft = FakeTransport()
        val rc = setupRadiaCode(ft, configuration = "DeviceName=RC-103\nFooBar=baz")
        // For v0, counts decode as raw u32 — provide an empty counts list.
        val spectrumBody = u32le(0) + f32le(0f) + f32le(1f) + f32le(0f)
        ft.enqueueResponseFor(
            Command.RD_VIRT_STRING.value, 0x80 + 5,
            payload = u32le(1) + u32le(spectrumBody.size) + spectrumBody,
        )
        val spec = rc.spectrum()
        assertEquals(0, spec.counts.size)
    }

    @Test
    fun `init parses SpecFormatVersion with whitespace`() {
        val ft = FakeTransport()
        // ensure "trim" in implementation handles leading/trailing space around the value
        setupRadiaCode(ft, configuration = "SpecFormatVersion= 1 \nDeviceName=RC")
        // No throw means trim() worked.
    }

    @Test
    fun `init throws IncompatibleFirmware on target lt 4_8`() {
        val ft = FakeTransport()
        try {
            setupRadiaCode(ft, targetMajor = 4, targetMinor = 7)
            fail("expected IncompatibleFirmware")
        } catch (e: RadiaCodeException.IncompatibleFirmware) {
            assertTrue(e.message!!.contains("4.7"))
        }
    }

    @Test
    fun `init throws IncompatibleFirmware on target lt 4`() {
        val ft = FakeTransport()
        try {
            setupRadiaCode(ft, targetMajor = 3, targetMinor = 99)
            fail("expected IncompatibleFirmware")
        } catch (e: RadiaCodeException.IncompatibleFirmware) {
            assertTrue(e.message!!.contains("3.99"))
        }
    }

    @Test
    fun `init bypasses firmware check when ignoreFirmwareCompatibilityCheck=true`() {
        val ft = FakeTransport()
        // target 3.0 would normally throw — it must NOT throw with the flag.
        val rc = setupRadiaCode(ft, targetMajor = 3, targetMinor = 0, ignoreFirmwareCheck = true)
        assertNotNull(rc)
    }

    @Test
    fun `baseTime is approximately now plus 128 seconds`() {
        val ft = FakeTransport()
        val rc = setupRadiaCode(ft)
        val expected = Instant.now().plusSeconds(128)
        val deltaSec = ChronoUnit.SECONDS.between(expected, rc.baseTime())
        assertTrue("baseTime delta=$deltaSec", kotlin.math.abs(deltaSec) <= 2)
    }

    @Test
    fun `configuration decodes cp1251 bytes`() {
        val ft = FakeTransport()
        // 'Ё' encodes to byte 0xA8 in cp1251.
        val cyrillic = "Имя=РК\nSpecFormatVersion=1"
        val rc = setupRadiaCode(ft, configuration = cyrillic)
        // Issue a follow-up configuration() and verify it round-trips
        val cfgBytes = cyrillic.toByteArray(Charset.forName("windows-1251"))
        ft.enqueueResponseFor(
            Command.RD_VIRT_STRING.value, 0x80 + 5,
            payload = u32le(1) + u32le(cfgBytes.size) + cfgBytes,
        )
        assertEquals(cyrillic, rc.configuration())
    }

    // =====================================================================
    // execute() tests
    // =====================================================================

    @Test
    fun `execute seq cycles 0 through 31 and wraps to 0`() {
        val ft = FakeTransport()
        val rc = setupRadiaCode(ft)
        // After init, internal seq counter is at 5. Issue 33 GET_STATUS calls.
        for (i in 0 until 33) {
            val statusSeqByte = (0x80 + ((5 + i) % 32))
            ft.enqueueResponseFor(Command.GET_STATUS.value, statusSeqByte, payload = u32le(0))
        }
        for (i in 0 until 33) {
            rc.status()
        }
        // Validate seq pattern in captured requests: indices 5..37
        for (i in 0 until 33) {
            val req = ft.requests[5 + i]
            val expectedSeq = 0x80 + ((5 + i) % 32)
            assertEquals("at i=$i", expectedSeq, seqAt(req))
        }
    }

    @Test
    fun `execute increments seq starting from 0x80`() {
        val ft = FakeTransport()
        setupRadiaCode(ft)
        // Captured init requests should show seq 0x80, 0x81, 0x82, 0x83, 0x84.
        assertEquals(0x80, seqAt(ft.requests[0]))
        assertEquals(0x81, seqAt(ft.requests[1]))
        assertEquals(0x82, seqAt(ft.requests[2]))
        assertEquals(0x83, seqAt(ft.requests[3]))
        assertEquals(0x84, seqAt(ft.requests[4]))
    }

    @Test
    fun `execute throws HeaderMismatch on cmd echo mismatch`() {
        val ft = FakeTransport()
        val rc = setupRadiaCode(ft)
        // Request will be GET_STATUS at seq=5 — enqueue a response with a different cmd.
        ft.enqueueResponseFor(Command.SET_EXCHANGE.value, 0x80 + 5, payload = u32le(0))
        try {
            rc.status()
            fail("expected HeaderMismatch")
        } catch (e: RadiaCodeException.HeaderMismatch) {
            // ok
        }
    }

    @Test
    fun `execute throws HeaderMismatch on seq echo mismatch`() {
        val ft = FakeTransport()
        val rc = setupRadiaCode(ft)
        // Wrong seq (0x99 instead of 0x85) — should fail header echo check.
        ft.enqueueResponseFor(Command.GET_STATUS.value, 0x99, payload = u32le(0))
        try {
            rc.status()
            fail("expected HeaderMismatch")
        } catch (e: RadiaCodeException.HeaderMismatch) {
            // ok
        }
    }

    @Test
    fun `execute frames request with length prefix`() {
        val ft = FakeTransport()
        val rc = setupRadiaCode(ft)
        ft.enqueueResponseFor(Command.GET_STATUS.value, 0x80 + 5, payload = u32le(0))
        rc.status()
        val req = ft.requests[5]
        // First 4 bytes are the LE u32 length of (header + args).
        // GET_STATUS has no args, so payload length = 4.
        assertEquals(4, ByteBuffer.wrap(req, 0, 4).order(ByteOrder.LITTLE_ENDIAN).int)
        assertEquals(8, req.size)
    }

    // =====================================================================
    // readRequest tests
    // =====================================================================

    @Test
    fun `readRequest decodes payload of expected length`() {
        val ft = FakeTransport()
        val rc = setupRadiaCode(ft)
        val payload = "hello".toByteArray(Charsets.US_ASCII)
        ft.enqueueResponseFor(
            Command.RD_VIRT_STRING.value, 0x80 + 5,
            payload = u32le(1) + u32le(payload.size) + payload,
        )
        val r = rc.readRequest(Vs.TEXT_MESSAGE.value)
        assertArrayEquals(payload, r.remaining())
    }

    @Test
    fun `readRequest strips trailing 0x00 (firmware HACK)`() {
        val ft = FakeTransport()
        val rc = setupRadiaCode(ft)
        val payload = "hi".toByteArray(Charsets.US_ASCII)
        // flen=2 but actual remaining size is 3 (trailing 0x00).
        ft.enqueueResponseFor(
            Command.RD_VIRT_STRING.value, 0x80 + 5,
            payload = u32le(1) + u32le(payload.size) + payload + byteArrayOf(0x00),
        )
        val r = rc.readRequest(Vs.TEXT_MESSAGE.value)
        assertArrayEquals(payload, r.remaining())
    }

    @Test
    fun `readRequest throws BadRetcode on retcode != 1`() {
        val ft = FakeTransport()
        val rc = setupRadiaCode(ft)
        ft.enqueueResponseFor(
            Command.RD_VIRT_STRING.value, 0x80 + 5,
            payload = u32le(2) + u32le(0),
        )
        try {
            rc.readRequest(Vs.TEXT_MESSAGE.value)
            fail("expected BadRetcode")
        } catch (e: RadiaCodeException.BadRetcode) {
            assertTrue(e.message!!.contains("retcode 2"))
        }
    }

    @Test
    fun `readRequest throws SizeMismatch on length mismatch`() {
        val ft = FakeTransport()
        val rc = setupRadiaCode(ft)
        // Claim flen=10 but provide 5 bytes (and not the trailing-zero special case).
        ft.enqueueResponseFor(
            Command.RD_VIRT_STRING.value, 0x80 + 5,
            payload = u32le(1) + u32le(10) + "abcde".toByteArray(Charsets.US_ASCII),
        )
        try {
            rc.readRequest(Vs.TEXT_MESSAGE.value)
            fail("expected SizeMismatch")
        } catch (e: RadiaCodeException.SizeMismatch) {
            // ok
        }
    }

    // =====================================================================
    // writeRequest tests
    // =====================================================================

    @Test
    fun `writeRequest sends commandId followed by data`() {
        val ft = FakeTransport()
        val rc = setupRadiaCode(ft)
        val data = byteArrayOf(0x01, 0x02, 0x03, 0x04)
        ft.enqueueResponseFor(Command.WR_VIRT_SFR.value, 0x80 + 5, payload = u32le(1))
        rc.writeRequest(0x1234, data)
        val args = argsOf(ft.requests[5])
        assertArrayEquals(u32le(0x1234) + data, args)
    }

    @Test
    fun `writeRequest throws BadRetcode on retcode != 1`() {
        val ft = FakeTransport()
        val rc = setupRadiaCode(ft)
        ft.enqueueResponseFor(Command.WR_VIRT_SFR.value, 0x80 + 5, payload = u32le(0))
        try {
            rc.writeRequest(0x1234)
            fail("expected BadRetcode")
        } catch (e: RadiaCodeException.BadRetcode) {
            // ok
        }
    }

    @Test
    fun `writeRequest throws SizeMismatch on trailing bytes`() {
        val ft = FakeTransport()
        val rc = setupRadiaCode(ft)
        ft.enqueueResponseFor(
            Command.WR_VIRT_SFR.value, 0x80 + 5,
            payload = u32le(1) + byteArrayOf(0x00, 0x00),
        )
        try {
            rc.writeRequest(0x1234)
            fail("expected SizeMismatch")
        } catch (e: RadiaCodeException.SizeMismatch) {
            // ok
        }
    }

    // =====================================================================
    // batchReadVsfrs tests
    // =====================================================================

    @Test
    fun `batchReadVsfrs decodes mixed types`() {
        val ft = FakeTransport()
        val rc = setupRadiaCode(ft)
        // Request: DEVICE_LANG (3xByte → Int), CHN_TO_keV_A0 (F32), DEVICE_ON (3xBool)
        val ids = listOf(Vsfr.DEVICE_LANG, Vsfr.CHN_TO_keV_A0, Vsfr.DEVICE_ON)
        // raw u32 values: 1) language=1 in top byte → 0x01000000; 2) f32 bits for 1.5; 3) bool=1 → 0x01000000
        val v0 = 0x01 shl 24 // top byte = 1 → ThreeXByte returns 1
        val v1 = java.lang.Float.floatToIntBits(1.5f)
        val v2 = 0x01 shl 24 // top byte = 1 → ThreeXBool returns true
        val expectedFlags = (1 shl 3) - 1
        val payload = u32le(expectedFlags) + u32le(v0) + u32le(v1) + u32le(v2)
        ft.enqueueResponseFor(Command.RD_VIRT_SFR_BATCH.value, 0x80 + 5, payload = payload)

        val result = rc.batchReadVsfrs(ids)
        assertEquals(3, result.size)
        assertEquals(1, result[0])
        assertEquals(1.5f, result[1] as Float, 0.0001f)
        assertEquals(true, result[2])
    }

    @Test
    fun `batchReadVsfrs throws InvalidValidityFlags on validity mismatch`() {
        val ft = FakeTransport()
        val rc = setupRadiaCode(ft)
        val ids = listOf(Vsfr.DEVICE_ON, Vsfr.SOUND_ON)
        // expected = 0b11, send 0b01
        ft.enqueueResponseFor(
            Command.RD_VIRT_SFR_BATCH.value, 0x80 + 5,
            payload = u32le(0b01) + u32le(0) + u32le(0),
        )
        try {
            rc.batchReadVsfrs(ids)
            fail("expected InvalidValidityFlags")
        } catch (e: RadiaCodeException.InvalidValidityFlags) {
            // ok
        }
    }

    @Test
    fun `batchReadVsfrs rejects empty list`() {
        val ft = FakeTransport()
        val rc = setupRadiaCode(ft)
        try {
            rc.batchReadVsfrs(emptyList())
            fail("expected InvalidArgument")
        } catch (e: RadiaCodeException.InvalidArgument) {
            // ok
        }
    }

    @Test
    fun `batchReadVsfrs sends correct request payload`() {
        val ft = FakeTransport()
        val rc = setupRadiaCode(ft)
        val ids = listOf(Vsfr.DEVICE_ON, Vsfr.SOUND_ON)
        ft.enqueueResponseFor(
            Command.RD_VIRT_SFR_BATCH.value, 0x80 + 5,
            payload = u32le(0b11) + u32le(0x01000000) + u32le(0),
        )
        rc.batchReadVsfrs(ids)
        val args = argsOf(ft.requests[5])
        val expected = u32le(2) + u32le(Vsfr.DEVICE_ON.value) + u32le(Vsfr.SOUND_ON.value)
        assertArrayEquals(expected, args)
    }

    // =====================================================================
    // status / setLocalTime / fwSignature / fwVersion / hwSerialNumber
    // =====================================================================

    @Test
    fun `status formats flags as Python tuple`() {
        val ft = FakeTransport()
        val rc = setupRadiaCode(ft)
        ft.enqueueResponseFor(Command.GET_STATUS.value, 0x80 + 5, payload = u32le(42))
        val s = rc.status()
        assertEquals("status flags: (42,)", s)
    }

    @Test
    fun `setLocalTime encodes day month year-2000 0 sec min hour 0`() {
        val ft = FakeTransport()
        val rc = setupRadiaCode(ft)
        ft.enqueueResponseFor(Command.SET_TIME.value, 0x80 + 5)
        val dt = java.time.LocalDateTime.of(2024, 6, 15, 13, 45, 30)
        rc.setLocalTime(dt)
        val args = argsOf(ft.requests[5])
        assertArrayEquals(
            byteArrayOf(15, 6, 24, 0, 30, 45, 13, 0),
            args,
        )
    }

    @Test
    fun `fwSignature formats hex signature plus filename plus idstring`() {
        val ft = FakeTransport()
        val rc = setupRadiaCode(ft)
        val payload = u32le(0xDEADBEEF.toInt()) + lengthPrefixed("foo.bin") + lengthPrefixed("ID-X")
        ft.enqueueResponseFor(Command.FW_SIGNATURE.value, 0x80 + 5, payload = payload)
        val s = rc.fwSignature()
        assertEquals("Signature: DEADBEEF, FileName=\"foo.bin\", IdString=\"ID-X\"", s)
    }

    @Test
    fun `fwVersion parses boot and target blocks`() {
        val ft = FakeTransport()
        val rc = setupRadiaCode(ft)
        val payload = u16le(2) + u16le(4) + lengthPrefixed("Jan 1 2024") +
            u16le(8) + u16le(4) + lengthPrefixed("Jan 2 2024")
        ft.enqueueResponseFor(Command.GET_VERSION.value, 0x80 + 5, payload = payload)
        val (boot, target) = rc.fwVersion()
        assertEquals(FwVersion(4, 2, "Jan 1 2024"), boot)
        assertEquals(FwVersion(4, 8, "Jan 2 2024"), target)
    }

    @Test
    fun `fwVersion strips NUL byte from target_date`() {
        val ft = FakeTransport()
        val rc = setupRadiaCode(ft)
        // target_date with trailing 0x00 byte — Python: target_date.strip('\x00')
        val targetDateBytes = "Apr 1 2024".toByteArray(Charsets.US_ASCII) + byteArrayOf(0)
        val targetDateLp = byteArrayOf(targetDateBytes.size.toByte()) + targetDateBytes
        val payload = u16le(2) + u16le(4) + lengthPrefixed("Boot 2024") +
            u16le(8) + u16le(4) + targetDateLp
        ft.enqueueResponseFor(Command.GET_VERSION.value, 0x80 + 5, payload = payload)
        val (_, target) = rc.fwVersion()
        assertEquals("Apr 1 2024", target.date)
    }

    @Test
    fun `hwSerialNumber parses groups and joins with hyphens`() {
        val ft = FakeTransport()
        val rc = setupRadiaCode(ft)
        // Two groups: 0x12345678, 0x9ABCDEF0
        val payload = u32le(8) + u32le(0x12345678) + u32le(0x9ABCDEF0.toInt())
        ft.enqueueResponseFor(Command.GET_SERIAL.value, 0x80 + 5, payload = payload)
        val s = rc.hwSerialNumber()
        assertEquals("12345678-9ABCDEF0", s)
    }

    @Test
    fun `hwSerialNumber throws on serial_len not multiple of 4`() {
        val ft = FakeTransport()
        val rc = setupRadiaCode(ft)
        val payload = u32le(5) + byteArrayOf(0, 0, 0, 0, 0)
        ft.enqueueResponseFor(Command.GET_SERIAL.value, 0x80 + 5, payload = payload)
        try {
            rc.hwSerialNumber()
            fail("expected SizeMismatch")
        } catch (e: RadiaCodeException.SizeMismatch) {
            // ok
        }
    }

    // =====================================================================
    // string getters: configuration / textMessage / serialNumber / commands
    // =====================================================================

    @Test
    fun `textMessage decodes ASCII`() {
        val ft = FakeTransport()
        val rc = setupRadiaCode(ft)
        val msg = "hello world"
        val bytes = msg.toByteArray(Charsets.US_ASCII)
        ft.enqueueResponseFor(
            Command.RD_VIRT_STRING.value, 0x80 + 5,
            payload = u32le(1) + u32le(bytes.size) + bytes,
        )
        assertEquals(msg, rc.textMessage())
        assertEquals(Vs.TEXT_MESSAGE.value, ByteBuffer.wrap(argsOf(ft.requests[5])).order(ByteOrder.LITTLE_ENDIAN).int)
    }

    @Test
    fun `serialNumber decodes ASCII`() {
        val ft = FakeTransport()
        val rc = setupRadiaCode(ft)
        val s = "SN-12345"
        val bytes = s.toByteArray(Charsets.US_ASCII)
        ft.enqueueResponseFor(
            Command.RD_VIRT_STRING.value, 0x80 + 5,
            payload = u32le(1) + u32le(bytes.size) + bytes,
        )
        assertEquals(s, rc.serialNumber())
        assertEquals(Vs.SERIAL_NUMBER.value, ByteBuffer.wrap(argsOf(ft.requests[5])).order(ByteOrder.LITTLE_ENDIAN).int)
    }

    @Test
    fun `commands decodes ASCII from VS_SFR_FILE`() {
        val ft = FakeTransport()
        val rc = setupRadiaCode(ft)
        val s = "cmd1\ncmd2"
        val bytes = s.toByteArray(Charsets.US_ASCII)
        ft.enqueueResponseFor(
            Command.RD_VIRT_STRING.value, 0x80 + 5,
            payload = u32le(1) + u32le(bytes.size) + bytes,
        )
        assertEquals(s, rc.commands())
        assertEquals(Vs.SFR_FILE.value, ByteBuffer.wrap(argsOf(ft.requests[5])).order(ByteOrder.LITTLE_ENDIAN).int)
    }

    // =====================================================================
    // deviceTime / dataBuf
    // =====================================================================

    @Test
    fun `deviceTime writes value to DEVICE_TIME`() {
        val ft = FakeTransport()
        val rc = setupRadiaCode(ft)
        ft.enqueueResponseFor(Command.WR_VIRT_SFR.value, 0x80 + 5, payload = u32le(1))
        rc.deviceTime(42)
        val args = argsOf(ft.requests[5])
        assertArrayEquals(u32le(Vsfr.DEVICE_TIME.value) + u32le(42), args)
    }

    @Test
    fun `dataBuf returns empty list for empty buffer`() {
        val ft = FakeTransport()
        val rc = setupRadiaCode(ft)
        ft.enqueueResponseFor(
            Command.RD_VIRT_STRING.value, 0x80 + 5,
            payload = u32le(1) + u32le(0),
        )
        assertEquals(0, rc.dataBuf().size)
    }

    @Test
    fun `dataBuf decodes a single RealTime record`() {
        val ft = FakeTransport()
        val rc = setupRadiaCode(ft)
        // <BBBi> header (seq=0, eid=0, gid=0, ts_offset=0) + <ffHHHB>
        val record = byteArrayOf(0, 0, 0) + u32le(0) +
            f32le(1.5f) + f32le(2.5f) +
            u16le(10) + u16le(20) + u16le(0xCAFE) +
            byteArrayOf(0x42)
        // 7 + 15 = 22
        assertEquals(22, record.size)
        ft.enqueueResponseFor(
            Command.RD_VIRT_STRING.value, 0x80 + 5,
            payload = u32le(1) + u32le(record.size) + record,
        )
        val records = rc.dataBuf()
        assertEquals(1, records.size)
        val rec = records[0]
        assertTrue(rec is DataBufRecord.RealTime)
        rec as DataBufRecord.RealTime
        assertEquals(1.5f, rec.data.countRate, 0.0001f)
        assertEquals(2.5f, rec.data.doseRate, 0.0001f)
        assertEquals(1.0, rec.data.countRateErr, 0.0001) // 10/10
        assertEquals(2.0, rec.data.doseRateErr, 0.0001)  // 20/10
        assertEquals(0xCAFE, rec.data.flags)
        assertEquals(0x42, rec.data.realTimeFlags)
    }

    // =====================================================================
    // spectrum / spectrumAccum / spectrumReset / energyCalib
    // =====================================================================

    @Test
    fun `spectrum reads VS_SPECTRUM`() {
        val ft = FakeTransport()
        val rc = setupRadiaCode(ft, configuration = "SpecFormatVersion=1")
        val body = u32le(60) + f32le(0f) + f32le(1f) + f32le(0f)
        ft.enqueueResponseFor(
            Command.RD_VIRT_STRING.value, 0x80 + 5,
            payload = u32le(1) + u32le(body.size) + body,
        )
        val spec = rc.spectrum()
        assertEquals(60L, spec.duration.seconds)
        // Verify the request asked for VS.SPECTRUM
        val args = argsOf(ft.requests[5])
        assertEquals(Vs.SPECTRUM.value, ByteBuffer.wrap(args).order(ByteOrder.LITTLE_ENDIAN).int)
    }

    @Test
    fun `spectrumAccum reads VS_SPEC_ACCUM`() {
        val ft = FakeTransport()
        val rc = setupRadiaCode(ft, configuration = "SpecFormatVersion=1")
        val body = u32le(120) + f32le(0f) + f32le(1f) + f32le(0f)
        ft.enqueueResponseFor(
            Command.RD_VIRT_STRING.value, 0x80 + 5,
            payload = u32le(1) + u32le(body.size) + body,
        )
        val spec = rc.spectrumAccum()
        assertEquals(120L, spec.duration.seconds)
        val args = argsOf(ft.requests[5])
        assertEquals(Vs.SPEC_ACCUM.value, ByteBuffer.wrap(args).order(ByteOrder.LITTLE_ENDIAN).int)
    }

    @Test
    fun `spectrumReset uses WR_VIRT_STRING with SPECTRUM and 0`() {
        val ft = FakeTransport()
        val rc = setupRadiaCode(ft)
        ft.enqueueResponseFor(Command.WR_VIRT_STRING.value, 0x80 + 5, payload = u32le(1))
        rc.spectrumReset()
        assertEquals(Command.WR_VIRT_STRING.value, cmdAt(ft.requests[5]))
        assertArrayEquals(u32le(Vs.SPECTRUM.value) + u32le(0), argsOf(ft.requests[5]))
    }

    @Test
    fun `spectrumReset throws on bad retcode`() {
        val ft = FakeTransport()
        val rc = setupRadiaCode(ft)
        ft.enqueueResponseFor(Command.WR_VIRT_STRING.value, 0x80 + 5, payload = u32le(0))
        try {
            rc.spectrumReset()
            fail("expected BadRetcode")
        } catch (e: RadiaCodeException.BadRetcode) {
            // ok
        }
    }

    @Test
    fun `energyCalib returns three floats`() {
        val ft = FakeTransport()
        val rc = setupRadiaCode(ft)
        val body = f32le(1.5f) + f32le(2.5f) + f32le(3.5f)
        ft.enqueueResponseFor(
            Command.RD_VIRT_STRING.value, 0x80 + 5,
            payload = u32le(1) + u32le(body.size) + body,
        )
        val coef = rc.energyCalib()
        assertEquals(listOf(1.5f, 2.5f, 3.5f), coef)
    }

    @Test
    fun `setEnergyCalib sends VS_ENERGY_CALIB plus 12-byte payload`() {
        val ft = FakeTransport()
        val rc = setupRadiaCode(ft)
        ft.enqueueResponseFor(Command.WR_VIRT_STRING.value, 0x80 + 5, payload = u32le(1))
        rc.setEnergyCalib(listOf(1.5f, 2.5f, 3.5f))
        val args = argsOf(ft.requests[5])
        val expected = u32le(Vs.ENERGY_CALIB.value) + u32le(12) +
            f32le(1.5f) + f32le(2.5f) + f32le(3.5f)
        assertArrayEquals(expected, args)
    }

    @Test
    fun `setEnergyCalib rejects coef of wrong size`() {
        val ft = FakeTransport()
        val rc = setupRadiaCode(ft)
        try {
            rc.setEnergyCalib(listOf(1f, 2f))
            fail("expected InvalidArgument")
        } catch (e: RadiaCodeException.InvalidArgument) {
            // ok
        }
    }

    // =====================================================================
    // doseReset / setLanguage / setDeviceOn / setSoundOn / setVibroOn
    // =====================================================================

    @Test
    fun `doseReset writes DOSE_RESET`() {
        val ft = FakeTransport()
        val rc = setupRadiaCode(ft)
        ft.enqueueResponseFor(Command.WR_VIRT_SFR.value, 0x80 + 5, payload = u32le(1))
        rc.doseReset()
        val args = argsOf(ft.requests[5])
        // No data argument — only the VSFR id.
        assertArrayEquals(u32le(Vsfr.DOSE_RESET.value), args)
    }

    @Test
    fun `setLanguage(ru) writes 0`() {
        val ft = FakeTransport()
        val rc = setupRadiaCode(ft)
        ft.enqueueResponseFor(Command.WR_VIRT_SFR.value, 0x80 + 5, payload = u32le(1))
        rc.setLanguage("ru")
        assertArrayEquals(u32le(Vsfr.DEVICE_LANG.value) + u32le(0), argsOf(ft.requests[5]))
    }

    @Test
    fun `setLanguage(en) writes 1`() {
        val ft = FakeTransport()
        val rc = setupRadiaCode(ft)
        ft.enqueueResponseFor(Command.WR_VIRT_SFR.value, 0x80 + 5, payload = u32le(1))
        rc.setLanguage("en")
        assertArrayEquals(u32le(Vsfr.DEVICE_LANG.value) + u32le(1), argsOf(ft.requests[5]))
    }

    @Test
    fun `setLanguage rejects unsupported lang`() {
        val ft = FakeTransport()
        val rc = setupRadiaCode(ft)
        try {
            rc.setLanguage("de")
            fail("expected InvalidArgument")
        } catch (e: RadiaCodeException.InvalidArgument) {
            // ok
        }
    }

    @Test
    fun `setDeviceOn writes to DEVICE_ON`() {
        val ft = FakeTransport()
        val rc = setupRadiaCode(ft)
        ft.enqueueResponseFor(Command.WR_VIRT_SFR.value, 0x80 + 5, payload = u32le(1))
        rc.setDeviceOn(true)
        assertArrayEquals(u32le(Vsfr.DEVICE_ON.value) + u32le(1), argsOf(ft.requests[5]))
    }

    @Test
    fun `setSoundOn writes to SOUND_ON`() {
        val ft = FakeTransport()
        val rc = setupRadiaCode(ft)
        ft.enqueueResponseFor(Command.WR_VIRT_SFR.value, 0x80 + 5, payload = u32le(1))
        rc.setSoundOn(true)
        assertArrayEquals(u32le(Vsfr.SOUND_ON.value) + u32le(1), argsOf(ft.requests[5]))
    }

    @Test
    fun `setVibroOn writes to SOUND_ON (Python parity)`() {
        // Mirrors the Python bug: set_vibro_on writes VSFR.SOUND_ON, not VIBRO_ON.
        val ft = FakeTransport()
        val rc = setupRadiaCode(ft)
        ft.enqueueResponseFor(Command.WR_VIRT_SFR.value, 0x80 + 5, payload = u32le(1))
        rc.setVibroOn(true)
        assertArrayEquals(u32le(Vsfr.SOUND_ON.value) + u32le(1), argsOf(ft.requests[5]))
    }

    // =====================================================================
    // setSoundCtrl / setVibroCtrl / setDisplayOffTime / setDisplayBrightness / setDisplayDirection
    // =====================================================================

    @Test
    fun `setSoundCtrl ORs masks`() {
        val ft = FakeTransport()
        val rc = setupRadiaCode(ft)
        ft.enqueueResponseFor(Command.WR_VIRT_SFR.value, 0x80 + 5, payload = u32le(1))
        rc.setSoundCtrl(listOf(Ctrl.BUTTONS, Ctrl.CLICKS, Ctrl.DOSE_RATE_ALARM_1))
        val expectedFlags = Ctrl.BUTTONS.mask or Ctrl.CLICKS.mask or Ctrl.DOSE_RATE_ALARM_1.mask
        assertArrayEquals(u32le(Vsfr.SOUND_CTRL.value) + u32le(expectedFlags), argsOf(ft.requests[5]))
    }

    @Test
    fun `setVibroCtrl ORs masks excluding CLICKS`() {
        val ft = FakeTransport()
        val rc = setupRadiaCode(ft)
        ft.enqueueResponseFor(Command.WR_VIRT_SFR.value, 0x80 + 5, payload = u32le(1))
        rc.setVibroCtrl(listOf(Ctrl.BUTTONS, Ctrl.DOSE_ALARM_1))
        val expectedFlags = Ctrl.BUTTONS.mask or Ctrl.DOSE_ALARM_1.mask
        assertArrayEquals(u32le(Vsfr.VIBRO_CTRL.value) + u32le(expectedFlags), argsOf(ft.requests[5]))
    }

    @Test
    fun `setVibroCtrl rejects CLICKS`() {
        val ft = FakeTransport()
        val rc = setupRadiaCode(ft)
        try {
            rc.setVibroCtrl(listOf(Ctrl.BUTTONS, Ctrl.CLICKS))
            fail("expected InvalidArgument")
        } catch (e: RadiaCodeException.InvalidArgument) {
            // ok
        }
    }

    @Test
    fun `setDisplayOffTime maps 5_10_15_30 to 0_1_2_3`() {
        val ft = FakeTransport()
        val rc = setupRadiaCode(ft)
        // Pre-stock 4 WR_VIRT_SFR responses for seq 5..8.
        for (i in 0 until 4) {
            ft.enqueueResponseFor(Command.WR_VIRT_SFR.value, 0x80 + (5 + i), payload = u32le(1))
        }
        rc.setDisplayOffTime(5)
        rc.setDisplayOffTime(10)
        rc.setDisplayOffTime(15)
        rc.setDisplayOffTime(30)
        assertArrayEquals(u32le(Vsfr.DISP_OFF_TIME.value) + u32le(0), argsOf(ft.requests[5]))
        assertArrayEquals(u32le(Vsfr.DISP_OFF_TIME.value) + u32le(1), argsOf(ft.requests[6]))
        assertArrayEquals(u32le(Vsfr.DISP_OFF_TIME.value) + u32le(2), argsOf(ft.requests[7]))
        assertArrayEquals(u32le(Vsfr.DISP_OFF_TIME.value) + u32le(3), argsOf(ft.requests[8]))
    }

    @Test
    fun `setDisplayOffTime rejects invalid values`() {
        val ft = FakeTransport()
        val rc = setupRadiaCode(ft)
        try {
            rc.setDisplayOffTime(7)
            fail("expected InvalidArgument")
        } catch (e: RadiaCodeException.InvalidArgument) {
            // ok
        }
    }

    @Test
    fun `setDisplayBrightness writes value`() {
        val ft = FakeTransport()
        val rc = setupRadiaCode(ft)
        ft.enqueueResponseFor(Command.WR_VIRT_SFR.value, 0x80 + 5, payload = u32le(1))
        rc.setDisplayBrightness(7)
        assertArrayEquals(u32le(Vsfr.DISP_BRT.value) + u32le(7), argsOf(ft.requests[5]))
    }

    @Test
    fun `setDisplayBrightness rejects out-of-range`() {
        val ft = FakeTransport()
        val rc = setupRadiaCode(ft)
        try {
            rc.setDisplayBrightness(10)
            fail("expected InvalidArgument")
        } catch (e: RadiaCodeException.InvalidArgument) {
            // ok
        }
    }

    @Test
    fun `setDisplayDirection writes direction value`() {
        val ft = FakeTransport()
        val rc = setupRadiaCode(ft)
        ft.enqueueResponseFor(Command.WR_VIRT_SFR.value, 0x80 + 5, payload = u32le(1))
        rc.setDisplayDirection(DisplayDirection.LEFT)
        assertArrayEquals(u32le(Vsfr.DISP_DIR.value) + u32le(DisplayDirection.LEFT.value), argsOf(ft.requests[5]))
    }

    // =====================================================================
    // getAlarmLimits / setAlarmLimits
    // =====================================================================

    @Test
    fun `getAlarmLimits applies Sv and cpm multipliers`() {
        val ft = FakeTransport()
        val rc = setupRadiaCode(ft)
        // 8 VSFRs requested → validity = 0xFF
        // resp[0..5] = u32 ints (top byte irrelevant for U32 format)
        // resp[6] = DS_UNITS (3xBool, top byte 1 → true) → Sv → doseMul=100
        // resp[7] = CR_UNITS (3xBool, top byte 1 → true) → cpm → countMul=60
        val payload = u32le(0xFF) +
            u32le(1000) + // l1 cr cp10s
            u32le(2000) + // l2 cr cp10s
            u32le(50) +   // l1 dr uR/h
            u32le(100) +  // l2 dr uR/h
            u32le(1_000_000) + // l1 ds uR
            u32le(2_000_000) + // l2 ds uR
            u32le(0x01000000) + // DS_UNITS true (top byte=1)
            u32le(0x01000000)   // CR_UNITS true
        ft.enqueueResponseFor(Command.RD_VIRT_SFR_BATCH.value, 0x80 + 5, payload = payload)
        val limits = rc.getAlarmLimits()
        // count multipliers: cpm → countMul=60, divide by 10 first
        assertEquals(1000.0 / 10.0 * 60.0, limits.l1CountRate, 0.0001)
        assertEquals(2000.0 / 10.0 * 60.0, limits.l2CountRate, 0.0001)
        // dose rate: Sv → doseMul=100
        assertEquals(50.0 / 100.0, limits.l1DoseRate, 0.0001)
        assertEquals(100.0 / 100.0, limits.l2DoseRate, 0.0001)
        // dose: divide by 1e6 then by doseMul
        assertEquals(1.0 / 100.0, limits.l1Dose, 1e-9)
        assertEquals(2.0 / 100.0, limits.l2Dose, 1e-9)
        assertEquals("Sv", limits.doseUnit)
        assertEquals("cpm", limits.countUnit)
    }

    @Test
    fun `getAlarmLimits applies Roentgen and cps multipliers`() {
        val ft = FakeTransport()
        val rc = setupRadiaCode(ft)
        val payload = u32le(0xFF) +
            u32le(1000) +
            u32le(2000) +
            u32le(50) +
            u32le(100) +
            u32le(1_000_000) +
            u32le(2_000_000) +
            u32le(0) + // DS_UNITS false → R
            u32le(0)   // CR_UNITS false → cps
        ft.enqueueResponseFor(Command.RD_VIRT_SFR_BATCH.value, 0x80 + 5, payload = payload)
        val limits = rc.getAlarmLimits()
        assertEquals(100.0, limits.l1CountRate, 0.0001) // 1000/10*1
        assertEquals(200.0, limits.l2CountRate, 0.0001)
        assertEquals(50.0, limits.l1DoseRate, 0.0001)
        assertEquals(100.0, limits.l2DoseRate, 0.0001)
        assertEquals(1.0, limits.l1Dose, 1e-9) // 1e6/1e6/1
        assertEquals(2.0, limits.l2Dose, 1e-9)
        assertEquals("R", limits.doseUnit)
        assertEquals("cps", limits.countUnit)
    }

    @Test
    fun `setAlarmLimits with no arguments throws InvalidArgument`() {
        val ft = FakeTransport()
        val rc = setupRadiaCode(ft)
        try {
            rc.setAlarmLimits()
            fail("expected InvalidArgument")
        } catch (e: RadiaCodeException.InvalidArgument) {
            // ok
        }
    }

    @Test
    fun `setAlarmLimits negative l1CountRate throws`() {
        val ft = FakeTransport()
        val rc = setupRadiaCode(ft)
        try {
            rc.setAlarmLimits(l1CountRate = -1.0)
            fail("expected InvalidArgument")
        } catch (e: RadiaCodeException.InvalidArgument) {
            assertTrue(e.message!!.contains("l1_count_rate"))
        }
    }

    @Test
    fun `setAlarmLimits negative l1DoseRate throws`() {
        val ft = FakeTransport()
        val rc = setupRadiaCode(ft)
        try {
            rc.setAlarmLimits(l1DoseRate = -1.0)
            fail("expected InvalidArgument")
        } catch (e: RadiaCodeException.InvalidArgument) {
            assertTrue(e.message!!.contains("l1_dose_rate"))
        }
    }

    @Test
    fun `setAlarmLimits negative l1Dose throws`() {
        val ft = FakeTransport()
        val rc = setupRadiaCode(ft)
        try {
            rc.setAlarmLimits(l1Dose = -1.0)
            fail("expected InvalidArgument")
        } catch (e: RadiaCodeException.InvalidArgument) {
            assertTrue(e.message!!.contains("l1_dose"))
        }
    }

    @Test
    fun `setAlarmLimits writes batch payload and returns true on full validity`() {
        val ft = FakeTransport()
        val rc = setupRadiaCode(ft)
        // Two limits: l1_count_rate=100, l1_dose_rate=50 (no unit conversions specified).
        // count_multiplier=1 (countUnitCpm null), dose_multiplier=1 (doseUnitSv null).
        // expected validity = 0b11
        ft.enqueueResponseFor(Command.WR_VIRT_SFR_BATCH.value, 0x80 + 5, payload = u32le(0b11))
        val ok = rc.setAlarmLimits(l1CountRate = 100.0, l1DoseRate = 50.0)
        assertTrue(ok)
        val args = argsOf(ft.requests[5])
        // Layout: <I>(n=2) <2I>(ids) <2I>(values)
        val expected = u32le(2) +
            u32le(Vsfr.CR_LEV1_cp10s.value) + u32le(Vsfr.DR_LEV1_uR_h.value) +
            u32le(100) + u32le(50)
        assertArrayEquals(expected, args)
    }

    @Test
    fun `setAlarmLimits returns false when device validity does not match`() {
        val ft = FakeTransport()
        val rc = setupRadiaCode(ft)
        ft.enqueueResponseFor(Command.WR_VIRT_SFR_BATCH.value, 0x80 + 5, payload = u32le(0b01))
        val ok = rc.setAlarmLimits(l1CountRate = 1.0, l2CountRate = 2.0)
        assertFalse(ok)
    }

    @Test
    fun `setAlarmLimits applies Sv and cpm multipliers`() {
        val ft = FakeTransport()
        val rc = setupRadiaCode(ft)
        // doseUnitSv=true → doseMul=100; countUnitCpm=true → countMul = 1/6
        // l1_count_rate=60 cpm → 60 * 1/6 = 10 cps stored as cp10s? round(60/6)=10
        // l1_dose_rate=1 → 1 * 100 = 100 uR/h
        ft.enqueueResponseFor(Command.WR_VIRT_SFR_BATCH.value, 0x80 + 5, payload = u32le(0b1111))
        val ok = rc.setAlarmLimits(
            l1CountRate = 60.0,
            l1DoseRate = 1.0,
            doseUnitSv = true,
            countUnitCpm = true,
        )
        assertTrue(ok)
        val args = argsOf(ft.requests[5])
        val expected = u32le(4) +
            u32le(Vsfr.CR_LEV1_cp10s.value) + u32le(Vsfr.DR_LEV1_uR_h.value) +
            u32le(Vsfr.DS_UNITS.value) + u32le(Vsfr.CR_UNITS.value) +
            u32le(10) + u32le(100) + u32le(1) + u32le(1)
        assertArrayEquals(expected, args)
    }

    // =====================================================================
    // companion / close
    // =====================================================================

    @Test
    fun `spectrumChannelToEnergy applies quadratic`() {
        // a0 + a1*ch + a2*ch*ch
        val e = RadiaCode.spectrumChannelToEnergy(10, 1f, 2f, 3f)
        assertEquals(1f + 2f * 10 + 3f * 10 * 10, e, 0.0001f)
    }

    @Test
    fun `close delegates to transport`() {
        val ft = FakeTransport()
        val rc = setupRadiaCode(ft)
        assertFalse(ft.closed)
        rc.close()
        assertTrue(ft.closed)
    }
}
