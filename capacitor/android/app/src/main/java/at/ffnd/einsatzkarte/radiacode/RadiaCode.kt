package at.ffnd.einsatzkarte.radiacode

import android.content.Context
import at.ffnd.einsatzkarte.radiacode.decoders.DataBufDecoder
import at.ffnd.einsatzkarte.radiacode.decoders.DataBufRecord
import at.ffnd.einsatzkarte.radiacode.decoders.SpectrumDecoder
import at.ffnd.einsatzkarte.radiacode.protocol.BytesBuffer
import at.ffnd.einsatzkarte.radiacode.protocol.Command
import at.ffnd.einsatzkarte.radiacode.protocol.Ctrl
import at.ffnd.einsatzkarte.radiacode.protocol.DisplayDirection
import at.ffnd.einsatzkarte.radiacode.protocol.Vs
import at.ffnd.einsatzkarte.radiacode.protocol.Vsfr
import at.ffnd.einsatzkarte.radiacode.transport.BluetoothTransport
import at.ffnd.einsatzkarte.radiacode.transport.Transport
import at.ffnd.einsatzkarte.radiacode.types.AlarmLimits
import at.ffnd.einsatzkarte.radiacode.types.Spectrum
import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.nio.charset.Charset
import java.time.Instant
import java.time.LocalDateTime
import kotlin.math.roundToLong

/**
 * Kotlin port of `radiacode-python/src/radiacode/radiacode.py` (`RadiaCode` class).
 *
 * Owns a [Transport] instance for the duration of its lifetime. Constructor
 * blocks on a synchronous handshake (SET_EXCHANGE → SET_TIME → DEVICE_TIME=0
 * → GET_VERSION → CONFIGURATION). Must NOT be called from the main thread.
 *
 * Disconnect handling mirrors Python: when the transport drops, the next call
 * throws ConnectionClosed and the instance is dead — the caller creates a new
 * instance to reconnect.
 */
class RadiaCode internal constructor(
    private val transport: Transport,
    ignoreFirmwareCompatibilityCheck: Boolean = false,
) {
    private var seq: Int = 0
    private val baseTime: Instant
    private var spectrumFormatVersion: Int = 0

    /** Production constructor: opens a [BluetoothTransport]. */
    constructor(
        ctx: Context,
        bluetoothMac: String,
        ignoreFirmwareCompatibilityCheck: Boolean = false,
    ) : this(BluetoothTransport(ctx, bluetoothMac), ignoreFirmwareCompatibilityCheck)

    init {
        execute(Command.SET_EXCHANGE, byteArrayOf(0x01, 0xFF.toByte(), 0x12, 0xFF.toByte()))
        setLocalTime(LocalDateTime.now())
        deviceTime(0)
        baseTime = Instant.now().plusSeconds(128)
        val (_, target) = fwVersion()
        if (!ignoreFirmwareCompatibilityCheck && (target.major < 4 || (target.major == 4 && target.minor < 8))) {
            throw RadiaCodeException.IncompatibleFirmware("${target.major}.${target.minor}")
        }
        for (line in configuration().split('\n')) {
            if (line.startsWith("SpecFormatVersion")) {
                spectrumFormatVersion = line.split('=')[1].trim().toInt()
                break
            }
        }
    }

    /** Reference timestamp for `DATA_BUF` ts_offset interpretation. */
    fun baseTime(): Instant = baseTime

    /** Closes the underlying transport. */
    fun close() = transport.close()

    /**
     * Send a wire-protocol request and return the parsed response body.
     * Wraps the request in `<I>(len) <HBB>(cmd, 0, seq)` framing, sends it,
     * and asserts that the 4-byte echo header in the response matches.
     */
    fun execute(reqType: Command, args: ByteArray? = null, timeoutMs: Long = 10_000L): BytesBuffer {
        val reqSeqNo = 0x80 + seq
        seq = (seq + 1) % 32
        val header = ByteBuffer.allocate(4).order(ByteOrder.LITTLE_ENDIAN).apply {
            putShort(reqType.value.toShort())
            put(0)
            put(reqSeqNo.toByte())
        }.array()
        val request = header + (args ?: ByteArray(0))
        val full = ByteBuffer.allocate(4).order(ByteOrder.LITTLE_ENDIAN).putInt(request.size).array() + request
        val response = transport.execute(full, timeoutMs)
        val respHeader = response.bytes(4)
        if (!header.contentEquals(respHeader)) {
            throw RadiaCodeException.HeaderMismatch(header.toHexLower(), respHeader.toHexLower())
        }
        return response
    }

    /** Issue an `RD_VIRT_STRING` for the given command/VS/VSFR identifier. */
    fun readRequest(commandId: Int, timeoutMs: Long = 10_000L): BytesBuffer {
        val r = execute(Command.RD_VIRT_STRING, u32leArr(commandId), timeoutMs)
        val retcode = r.u32Le()
        val flen = r.u32Le().toInt()
        if (retcode != 1L) throw RadiaCodeException.BadRetcode("commandId=$commandId", retcode)
        val remaining = r.remaining()
        val data = when {
            remaining.size == flen -> remaining
            // HACK: workaround for new firmware bug — trailing 0x00
            remaining.size == flen + 1 && remaining[remaining.size - 1] == 0.toByte() -> remaining.copyOf(flen)
            else -> throw RadiaCodeException.SizeMismatch("commandId=$commandId", remaining.size, flen)
        }
        return BytesBuffer(data)
    }
    fun readRequest(vs: Vs, timeoutMs: Long = 10_000L): BytesBuffer = readRequest(vs.value, timeoutMs)
    fun readRequest(vsfr: Vsfr, timeoutMs: Long = 10_000L): BytesBuffer = readRequest(vsfr.value, timeoutMs)

    /** Issue a `WR_VIRT_SFR` to the given identifier. */
    fun writeRequest(commandId: Int, data: ByteArray? = null) {
        val r = execute(Command.WR_VIRT_SFR, u32leArr(commandId) + (data ?: ByteArray(0)))
        val retcode = r.u32Le()
        if (retcode != 1L) throw RadiaCodeException.BadRetcode("writeRequest commandId=$commandId", retcode)
        if (r.size() != 0) throw RadiaCodeException.SizeMismatch("writeRequest commandId=$commandId trailing", r.size(), 0)
    }
    fun writeRequest(vsfr: Vsfr, data: ByteArray? = null) = writeRequest(vsfr.value, data)

    /**
     * Batch-read multiple VSFRs in one round-trip. Each register's raw u32
     * value is decoded into its registered [VsfrFormat] type (Int / Float /
     * Boolean depending on the register).
     */
    fun batchReadVsfrs(vsfrIds: List<Vsfr>): List<Any> {
        val n = vsfrIds.size
        if (n == 0) throw RadiaCodeException.InvalidArgument("No VSFRs specified")
        val payload = ByteBuffer.allocate(4 * (n + 1)).order(ByteOrder.LITTLE_ENDIAN)
        payload.putInt(n)
        for (id in vsfrIds) payload.putInt(id.value)
        val r = execute(Command.RD_VIRT_SFR_BATCH, payload.array())
        val validity = r.u32Le().toInt()
        val expected = (1 shl n) - 1
        if (validity != expected) throw RadiaCodeException.InvalidValidityFlags(validity, expected)
        val raw = IntArray(n) { r.u32Le().toInt() }
        // r should be empty at this point; we don't enforce — Python doesn't either.
        return vsfrIds.mapIndexed { i, id ->
            id.format!!.decode(raw[i])
        }
    }

    /** Get the device status flags. */
    fun status(): String {
        val r = execute(Command.GET_STATUS)
        val flags = r.u32Le()
        if (r.size() != 0) throw RadiaCodeException.SizeMismatch("status trailing", r.size(), 0)
        return "status flags: ($flags,)"  // Python prints "status flags: (X,)" for single-element tuple
    }

    /** Set the device's local clock from a [LocalDateTime]. */
    fun setLocalTime(dt: LocalDateTime) {
        val d = ByteBuffer.allocate(8).apply {
            put(dt.dayOfMonth.toByte())
            put(dt.monthValue.toByte())
            put((dt.year - 2000).toByte())
            put(0)
            put(dt.second.toByte())
            put(dt.minute.toByte())
            put(dt.hour.toByte())
            put(0)
        }.array()
        execute(Command.SET_TIME, d)
    }

    /** Returns a human-readable firmware-signature string. */
    fun fwSignature(): String {
        val r = execute(Command.FW_SIGNATURE)
        val signature = r.u32Le()
        val filename = r.unpackString()
        val idstring = r.unpackString()
        return "Signature: ${"%08X".format(signature)}, FileName=\"$filename\", IdString=\"$idstring\""
    }

    /** Returns boot- and target-firmware versions. */
    fun fwVersion(): Pair<FwVersion, FwVersion> {
        val r = execute(Command.GET_VERSION)
        val bootMinor = r.u16Le()
        val bootMajor = r.u16Le()
        val bootDate = r.unpackString()
        val targetMinor = r.u16Le()
        val targetMajor = r.u16Le()
        val targetDate = r.unpackString()
        if (r.size() != 0) throw RadiaCodeException.SizeMismatch("fwVersion trailing", r.size(), 0)
        return Pair(
            FwVersion(bootMajor, bootMinor, bootDate),
            FwVersion(targetMajor, targetMinor, targetDate.trim(' ')),
        )
    }

    /** Returns the hardware serial number formatted as hyphen-separated hex groups. */
    fun hwSerialNumber(): String {
        val r = execute(Command.GET_SERIAL)
        val serialLen = r.u32Le().toInt()
        if (serialLen % 4 != 0) throw RadiaCodeException.SizeMismatch("hwSerialNumber serial_len%4", serialLen % 4, 0)
        val groups = (0 until serialLen / 4).map { r.u32Le() }
        if (r.size() != 0) throw RadiaCodeException.SizeMismatch("hwSerialNumber trailing", r.size(), 0)
        return groups.joinToString("-") { "%08X".format(it) }
    }

    /** Returns the device's configuration string (decoded as cp1251). */
    fun configuration(): String {
        val r = readRequest(Vs.CONFIGURATION)
        return String(r.remaining(), Charset.forName("windows-1251"))
    }
    fun textMessage(): String = String(readRequest(Vs.TEXT_MESSAGE).remaining(), Charsets.US_ASCII)
    fun serialNumber(): String = String(readRequest(Vs.SERIAL_NUMBER).remaining(), Charsets.US_ASCII)
    fun commands(): String = String(readRequest(Vs.SFR_FILE).remaining(), Charsets.US_ASCII)

    /** Set the device-side time counter. Called with `0` after init. */
    fun deviceTime(v: Int) = writeRequest(Vsfr.DEVICE_TIME, u32leArr(v))

    /**
     * Read the buffered measurement records since the last call. Polling
     * callers should pass a tighter [timeoutMs] than the default 10s so that
     * a half-dead BLE link is detected within the polling cadence rather
     * than after a full default timeout.
     */
    fun dataBuf(timeoutMs: Long = 10_000L): List<DataBufRecord> =
        DataBufDecoder.decode(readRequest(Vs.DATA_BUF, timeoutMs), baseTime)

    /** Current spectrum (resets on `spectrumReset`). */
    fun spectrum(): Spectrum = SpectrumDecoder.decode(readRequest(Vs.SPECTRUM), spectrumFormatVersion)
    /** Accumulated spectrum (does not reset). */
    fun spectrumAccum(): Spectrum = SpectrumDecoder.decode(readRequest(Vs.SPEC_ACCUM), spectrumFormatVersion)

    /** Reset the accumulated dose to zero. */
    fun doseReset() = writeRequest(Vsfr.DOSE_RESET)

    /** Reset the current spectrum to zero. */
    fun spectrumReset() {
        val payload = ByteBuffer.allocate(8).order(ByteOrder.LITTLE_ENDIAN)
            .putInt(Vs.SPECTRUM.value).putInt(0).array()
        val r = execute(Command.WR_VIRT_STRING, payload)
        val retcode = r.u32Le()
        if (retcode != 1L) throw RadiaCodeException.BadRetcode("spectrumReset", retcode)
        if (r.size() != 0) throw RadiaCodeException.SizeMismatch("spectrumReset trailing", r.size(), 0)
    }

    /** Returns the energy-calibration coefficients `[a0, a1, a2]`. */
    fun energyCalib(): List<Float> {
        val r = readRequest(Vs.ENERGY_CALIB)
        return listOf(r.f32Le(), r.f32Le(), r.f32Le())
    }

    /** Sets the energy-calibration coefficients `[a0, a1, a2]`. */
    fun setEnergyCalib(coef: List<Float>) {
        if (coef.size != 3) throw RadiaCodeException.InvalidArgument("coef must have 3 elements, got ${coef.size}")
        val pc = ByteBuffer.allocate(12).order(ByteOrder.LITTLE_ENDIAN)
            .putFloat(coef[0]).putFloat(coef[1]).putFloat(coef[2]).array()
        val prefix = ByteBuffer.allocate(8).order(ByteOrder.LITTLE_ENDIAN)
            .putInt(Vs.ENERGY_CALIB.value).putInt(pc.size).array()
        val payload = prefix + pc
        val r = execute(Command.WR_VIRT_STRING, payload)
        val retcode = r.u32Le()
        if (retcode != 1L) throw RadiaCodeException.BadRetcode("setEnergyCalib", retcode)
    }

    /** Set the device-UI language ("ru" or "en"). */
    fun setLanguage(lang: String = "ru") {
        if (lang != "ru" && lang != "en") throw RadiaCodeException.InvalidArgument("unsupported lang value '$lang' - use 'ru' or 'en'")
        writeRequest(Vsfr.DEVICE_LANG, u32leArr(if (lang == "en") 1 else 0))
    }

    fun setDeviceOn(on: Boolean) = writeRequest(Vsfr.DEVICE_ON, u32leArr(if (on) 1 else 0))
    fun setSoundOn(on: Boolean) = writeRequest(Vsfr.SOUND_ON, u32leArr(if (on) 1 else 0))
    /** NOTE: Python writes to `SOUND_ON` instead of `VIBRO_ON`. We mirror this 1:1.
     *  This looks like a bug in the Python source but we keep parity until upstream fixes. */
    fun setVibroOn(on: Boolean) = writeRequest(Vsfr.SOUND_ON, u32leArr(if (on) 1 else 0))

    fun setSoundCtrl(ctrls: List<Ctrl>) {
        var flags = 0
        for (c in ctrls) flags = flags or c.mask
        writeRequest(Vsfr.SOUND_CTRL, u32leArr(flags))
    }

    fun setVibroCtrl(ctrls: List<Ctrl>) {
        var flags = 0
        for (c in ctrls) {
            if (c == Ctrl.CLICKS) throw RadiaCodeException.InvalidArgument("CTRL.CLICKS not supported for vibro")
            flags = flags or c.mask
        }
        writeRequest(Vsfr.VIBRO_CTRL, u32leArr(flags))
    }

    fun setDisplayOffTime(seconds: Int) {
        if (seconds !in setOf(5, 10, 15, 30)) throw RadiaCodeException.InvalidArgument("seconds must be one of {5,10,15,30}, got $seconds")
        val v = if (seconds == 30) 3 else (seconds / 5) - 1
        writeRequest(Vsfr.DISP_OFF_TIME, u32leArr(v))
    }

    fun setDisplayBrightness(brightness: Int) {
        if (brightness !in 0..9) throw RadiaCodeException.InvalidArgument("brightness must be in 0..9, got $brightness")
        writeRequest(Vsfr.DISP_BRT, u32leArr(brightness))
    }

    fun setDisplayDirection(direction: DisplayDirection) =
        writeRequest(Vsfr.DISP_DIR, u32leArr(direction.value))

    /** Read the current alarm limits. */
    fun getAlarmLimits(): AlarmLimits {
        val regs = listOf(
            Vsfr.CR_LEV1_cp10s, Vsfr.CR_LEV2_cp10s,
            Vsfr.DR_LEV1_uR_h,  Vsfr.DR_LEV2_uR_h,
            Vsfr.DS_LEV1_uR,    Vsfr.DS_LEV2_uR,
            Vsfr.DS_UNITS,      Vsfr.CR_UNITS,
        )
        val resp = batchReadVsfrs(regs)
        val doseUnitSv = resp[6] as Boolean
        val countUnitCpm = resp[7] as Boolean
        val doseMul = if (doseUnitSv) 100.0 else 1.0
        val countMul = if (countUnitCpm) 60.0 else 1.0
        // resp[0..5] are integers (U32 → Int)
        val l1cr = (resp[0] as Int).toLong() and 0xFFFFFFFFL
        val l2cr = (resp[1] as Int).toLong() and 0xFFFFFFFFL
        val l1dr = (resp[2] as Int).toLong() and 0xFFFFFFFFL
        val l2dr = (resp[3] as Int).toLong() and 0xFFFFFFFFL
        val l1ds = (resp[4] as Int).toLong() and 0xFFFFFFFFL
        val l2ds = (resp[5] as Int).toLong() and 0xFFFFFFFFL
        return AlarmLimits(
            l1CountRate = l1cr / 10.0 * countMul,
            l2CountRate = l2cr / 10.0 * countMul,
            l1DoseRate  = l1dr / doseMul,
            l2DoseRate  = l2dr / doseMul,
            l1Dose      = l1ds / 1e6 / doseMul,
            l2Dose      = l2ds / 1e6 / doseMul,
            doseUnit  = if (doseUnitSv) "Sv" else "R",
            countUnit = if (countUnitCpm) "cpm" else "cps",
        )
    }

    /**
     * Set one or more alarm limits in a single batch write. Each non-null
     * argument is included; at least one must be non-null. Returns true iff
     * the device confirmed all writes (validity bitmask matches `(1<<n)-1`).
     */
    fun setAlarmLimits(
        l1CountRate: Double? = null, l2CountRate: Double? = null,
        l1DoseRate: Double? = null,  l2DoseRate: Double? = null,
        l1Dose: Double? = null,      l2Dose: Double? = null,
        doseUnitSv: Boolean? = null, countUnitCpm: Boolean? = null,
    ): Boolean {
        val ids = mutableListOf<Vsfr>()
        val values = mutableListOf<Int>()

        val doseMul = if (doseUnitSv == true) 100.0 else 1.0
        val countMul = when (countUnitCpm) {
            true -> 1.0 / 6.0
            false -> 10.0
            null -> 1.0
        }
        if (l1CountRate != null) {
            if (l1CountRate < 0) throw RadiaCodeException.InvalidArgument("bad l1_count_rate")
            ids += Vsfr.CR_LEV1_cp10s; values += (l1CountRate * countMul).roundToLong().toInt()
        }
        if (l2CountRate != null) {
            if (l2CountRate < 0) throw RadiaCodeException.InvalidArgument("bad l2_count_rate")
            ids += Vsfr.CR_LEV2_cp10s; values += (l2CountRate * countMul).roundToLong().toInt()
        }
        if (l1DoseRate != null) {
            if (l1DoseRate < 0) throw RadiaCodeException.InvalidArgument("bad l1_dose_rate")
            ids += Vsfr.DR_LEV1_uR_h; values += (l1DoseRate * doseMul).roundToLong().toInt()
        }
        if (l2DoseRate != null) {
            if (l2DoseRate < 0) throw RadiaCodeException.InvalidArgument("bad l2_dose_rate")
            ids += Vsfr.DR_LEV2_uR_h; values += (l2DoseRate * doseMul).roundToLong().toInt()
        }
        if (l1Dose != null) {
            if (l1Dose < 0) throw RadiaCodeException.InvalidArgument("bad l1_dose")
            ids += Vsfr.DS_LEV1_uR; values += (l1Dose * doseMul).roundToLong().toInt()
        }
        if (l2Dose != null) {
            if (l2Dose < 0) throw RadiaCodeException.InvalidArgument("bad l2_dose")
            ids += Vsfr.DS_LEV2_uR; values += (l2Dose * doseMul).roundToLong().toInt()
        }
        if (doseUnitSv != null) { ids += Vsfr.DS_UNITS; values += if (doseUnitSv) 1 else 0 }
        if (countUnitCpm != null) { ids += Vsfr.CR_UNITS; values += if (countUnitCpm) 1 else 0 }

        val n = ids.size
        if (n == 0) throw RadiaCodeException.InvalidArgument("No limits specified")

        val payload = ByteBuffer.allocate(4 * (1 + 2 * n)).order(ByteOrder.LITTLE_ENDIAN)
        payload.putInt(n)
        for (id in ids) payload.putInt(id.value)
        for (v in values) payload.putInt(v)
        val resp = execute(Command.WR_VIRT_SFR_BATCH, payload.array())
        val expected = (1 shl n) - 1
        return resp.u32Le().toInt() == expected
    }

    companion object {
        /** Convert a spectrometer channel number to energy (keV). */
        fun spectrumChannelToEnergy(channel: Int, a0: Float, a1: Float, a2: Float): Float =
            a0 + a1 * channel + a2 * channel * channel
    }
}

// helpers
private fun u32leArr(v: Int): ByteArray =
    ByteBuffer.allocate(4).order(ByteOrder.LITTLE_ENDIAN).putInt(v).array()

private fun ByteArray.toHexLower(): String =
    joinToString("") { "%02x".format(it) }
