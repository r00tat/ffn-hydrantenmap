package at.ffnd.einsatzkarte.radiacode.transport

import at.ffnd.einsatzkarte.radiacode.protocol.BytesBuffer
import java.util.ArrayDeque

/**
 * In-memory [Transport] for unit tests. Records every request and replies
 * with pre-enqueued response bodies (= what the wire delivers AFTER the
 * 4-byte length prefix is stripped by the real transport).
 *
 * The first 4 bytes of each enqueued response body MUST be the echo of the
 * request header (`<HBB>` = cmd_u16, reserved=0, seq).
 */
internal class FakeTransport : Transport {
    val requests = mutableListOf<ByteArray>()
    private val responses = ArrayDeque<ByteArray>()
    var closed = false; private set

    /** Adds a complete response body verbatim (including 4-byte echo header). */
    fun enqueueResponse(body: ByteArray) { responses.add(body) }

    /**
     * Convenience: build a response body from `(cmd, seq, payload)` and enqueue it.
     * The header is encoded as `<HBB>` little-endian (cmd_u16, reserved=0, seq).
     * `seq` should be the value with the 0x80 bit already set, matching what
     * RadiaCode.execute writes on the wire.
     */
    fun enqueueResponseFor(cmd: Int, seq: Int, payload: ByteArray = ByteArray(0)) {
        val header = byteArrayOf(
            (cmd and 0xFF).toByte(),
            ((cmd ushr 8) and 0xFF).toByte(),
            0,
            seq.toByte(),
        )
        responses.add(header + payload)
    }

    override fun execute(req: ByteArray, timeoutMs: Long): BytesBuffer {
        requests += req
        check(responses.isNotEmpty()) {
            "FakeTransport: no response enqueued for request #${requests.size}"
        }
        return BytesBuffer(responses.removeFirst())
    }

    override fun close() { closed = true }
}
