package at.ffnd.einsatzkarte.radiacode.decoders

import at.ffnd.einsatzkarte.radiacode.RadiaCodeException
import at.ffnd.einsatzkarte.radiacode.protocol.BytesBuffer
import at.ffnd.einsatzkarte.radiacode.types.Spectrum
import java.time.Duration

/**
 * Port of `radiacode-python/src/radiacode/decoders/spectrum.py`
 * (`decode_RC_VS_SPECTRUM`).
 *
 * Two on-the-wire encodings are supported (selected by the `formatVersion`
 * derived from the device configuration string):
 *  - **v0**: each count is a raw little-endian u32.
 *  - **v1**: run-length-encoded — a u16 header carries `cnt` (top 12 bits)
 *    and `vlen` (low 4 bits) per run; subsequent bytes contain the deltas.
 *
 * `vlen` semantics in v1:
 *  - `0` → emit `cnt` zeros, no payload bytes.
 *  - `1` → read `<B>` (u8) **absolute** — replaces `last`, not a delta.
 *  - `2` → read `<b>` (i8), apply as signed delta to `last`.
 *  - `3` → read `<h>` (i16 LE), apply as signed delta to `last`.
 *  - `4` → read `<BBb>` (u8, u8, i8), build a 24-bit signed delta where the
 *          top byte is sign-extended via [BytesBuffer.i8] before being shifted.
 *  - `5` → read `<i>` (i32 LE), apply as signed delta to `last`.
 *  - `≥6` → unsupported, throws [IllegalArgumentException].
 */
object SpectrumDecoder {

    /**
     * Decode an `RC_VS_SPECTRUM` payload from [buf].
     *
     * @param buf source positioned at the start of the spectrum payload
     *   (`<Ifff>` header followed by encoded counts).
     * @param formatVersion 0 or 1 — typically derived from the device
     *   configuration string. Anything else raises
     *   [RadiaCodeException.UnsupportedSpectrumFormatVersion].
     */
    fun decode(buf: BytesBuffer, formatVersion: Int): Spectrum {
        val durationSeconds = buf.u32Le()
        val a0 = buf.f32Le()
        val a1 = buf.f32Le()
        val a2 = buf.f32Le()
        val counts = when (formatVersion) {
            0 -> decodeCountsV0(buf)
            1 -> decodeCountsV1(buf)
            else -> throw RadiaCodeException.UnsupportedSpectrumFormatVersion(formatVersion)
        }
        return Spectrum(
            duration = Duration.ofSeconds(durationSeconds),
            a0 = a0,
            a1 = a1,
            a2 = a2,
            counts = counts,
        )
    }

    private fun decodeCountsV0(buf: BytesBuffer): List<Int> {
        val out = ArrayList<Int>()
        while (buf.size() > 0) {
            // Python uses '<I' (unsigned 32-bit). Spectrum counts realistically
            // fit in Int range; cast Long → Int matches Python's int behaviour
            // for any value below 2^31.
            out.add(buf.u32Le().toInt())
        }
        return out
    }

    private fun decodeCountsV1(buf: BytesBuffer): List<Int> {
        val out = ArrayList<Int>()
        var last = 0
        while (buf.size() > 0) {
            val u16 = buf.u16Le()
            val cnt = (u16 ushr 4) and 0x0FFF
            val vlen = u16 and 0x0F
            repeat(cnt) {
                val v = when (vlen) {
                    0 -> 0
                    1 -> buf.u8()                                  // absolute u8 — replaces last
                    2 -> last + buf.i8()                           // signed i8 delta
                    3 -> last + buf.i16Le()                        // signed i16 delta
                    4 -> {
                        val a = buf.u8()
                        val b = buf.u8()
                        val c = buf.i8()                           // signed top byte
                        last + ((c shl 16) or (b shl 8) or a)
                    }
                    5 -> last + buf.i32Le()                        // signed i32 delta
                    else -> throw IllegalArgumentException(
                        "unsupported vlen=$vlen in decode_RC_VS_SPECTRUM v1"
                    )
                }
                last = v
                out.add(v)
            }
        }
        return out
    }
}
