package at.ffnd.einsatzkarte.radiacode.protocol

import java.nio.ByteBuffer
import java.nio.ByteOrder

/**
 * Sequential little-endian byte reader. Port of `radiacode-python/src/radiacode/bytes_buffer.py`.
 *
 * Position starts at 0 and advances on every successful read. Failed reads (under-read) leave the
 * position untouched so callers can recover via try/catch in higher protocol layers.
 *
 * The constructor takes a snapshot copy of `data` so that external mutation cannot corrupt the
 * decoder state.
 */
class BytesBuffer(data: ByteArray) {

    private val data: ByteArray = data.copyOf()
    private var position: Int = 0

    /** Number of remaining unread bytes. */
    fun size(): Int = data.size - position

    /** Copy of all unread bytes from the current position to the end. */
    fun remaining(): ByteArray = data.copyOfRange(position, data.size)

    fun u8(): Int {
        ensureAvailable("u8", 1)
        val v = data[position].toInt() and 0xFF
        position += 1
        return v
    }

    fun i8(): Int {
        ensureAvailable("i8", 1)
        val v = data[position].toInt()  // sign-extends
        position += 1
        return v
    }

    fun u16Le(): Int {
        ensureAvailable("u16Le", 2)
        val b0 = data[position].toInt() and 0xFF
        val b1 = data[position + 1].toInt() and 0xFF
        position += 2
        return b0 or (b1 shl 8)
    }

    fun i16Le(): Int {
        ensureAvailable("i16Le", 2)
        val b0 = data[position].toInt() and 0xFF
        val b1 = data[position + 1].toInt() and 0xFF
        position += 2
        val raw = b0 or (b1 shl 8)
        // sign-extend from 16 bits
        return (raw shl 16) shr 16
    }

    fun u32Le(): Long {
        ensureAvailable("u32Le", 4)
        val b0 = data[position].toLong() and 0xFF
        val b1 = data[position + 1].toLong() and 0xFF
        val b2 = data[position + 2].toLong() and 0xFF
        val b3 = data[position + 3].toLong() and 0xFF
        position += 4
        return b0 or (b1 shl 8) or (b2 shl 16) or (b3 shl 24)
    }

    fun i32Le(): Int {
        ensureAvailable("i32Le", 4)
        val b0 = data[position].toInt() and 0xFF
        val b1 = data[position + 1].toInt() and 0xFF
        val b2 = data[position + 2].toInt() and 0xFF
        val b3 = data[position + 3].toInt() and 0xFF
        position += 4
        return b0 or (b1 shl 8) or (b2 shl 16) or (b3 shl 24)
    }

    fun f32Le(): Float {
        ensureAvailable("f32Le", 4)
        val bits = ByteBuffer.wrap(data, position, 4).order(ByteOrder.LITTLE_ENDIAN).int
        position += 4
        return Float.fromBits(bits)
    }

    fun f64Le(): Double {
        ensureAvailable("f64Le", 8)
        val bits = ByteBuffer.wrap(data, position, 8).order(ByteOrder.LITTLE_ENDIAN).long
        position += 8
        return Double.fromBits(bits)
    }

    fun bool(): Boolean {
        ensureAvailable("bool", 1)
        val v = data[position].toInt() and 0xFF
        position += 1
        return v != 0
    }

    fun skip(n: Int) {
        if (n == 0) return
        require(n > 0) { "skip(n): n must be non-negative, was $n" }
        ensureAvailable("skip", n)
        position += n
    }

    fun bytes(n: Int): ByteArray {
        require(n >= 0) { "bytes(n): n must be non-negative, was $n" }
        ensureAvailable("bytes", n)
        val out = data.copyOfRange(position, position + n)
        position += n
        return out
    }

    /**
     * Reads a 1-byte unsigned length prefix followed by `length` ASCII bytes.
     * On under-read, the position is rolled back so the length byte is unread.
     */
    fun unpackString(): String {
        ensureAvailable("unpackString(length)", 1)
        val length = data[position].toInt() and 0xFF
        // Do not commit the length read until we know the payload is available.
        if (data.size - position - 1 < length) {
            throw IllegalStateException(
                "unpackString(payload): need $length bytes, have ${data.size - position - 1}"
            )
        }
        position += 1
        if (length == 0) return ""
        val s = String(data, position, length, Charsets.US_ASCII)
        position += length
        return s
    }

    private fun ensureAvailable(op: String, need: Int) {
        val have = data.size - position
        if (have < need) {
            throw IllegalStateException("$op: need $need bytes, have $have")
        }
    }
}
