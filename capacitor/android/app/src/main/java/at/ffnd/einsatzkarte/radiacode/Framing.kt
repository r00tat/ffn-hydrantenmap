package at.ffnd.einsatzkarte.radiacode

import java.nio.ByteBuffer
import java.nio.ByteOrder

/**
 * Radiacode-Frame: `<len_u32_le><cmd_u16_le><reserved_u8=0><seq_u8><args…>`.
 * Match zur TS-Referenz `buildRequest` in `src/hooks/radiacode/protocol.ts`.
 */
object Framing {
    fun buildRequest(cmd: Int, seqIndex: Int, args: ByteArray): ByteArray {
        val seq = 0x80 or (seqIndex % Protocol.SEQ_MODULO)
        val payloadLen = 4 + args.size
        val buf = ByteBuffer.allocate(4 + payloadLen).order(ByteOrder.LITTLE_ENDIAN)
        buf.putInt(payloadLen)
        buf.putShort((cmd and 0xffff).toShort())
        buf.put(0)
        buf.put(seq.toByte())
        buf.put(args)
        return buf.array()
    }

    /** Zerlegt einen Frame in MTU-taugliche Write-Chunks (18 B default). */
    fun splitForWrite(frame: ByteArray, maxChunk: Int = Protocol.MAX_WRITE_CHUNK): List<ByteArray> {
        val chunks = ArrayList<ByteArray>()
        var off = 0
        while (off < frame.size) {
            val end = minOf(off + maxChunk, frame.size)
            chunks.add(frame.copyOfRange(off, end))
            off = end
        }
        return chunks
    }

    fun u32le(value: Int): ByteArray {
        val buf = ByteBuffer.allocate(4).order(ByteOrder.LITTLE_ENDIAN)
        buf.putInt(value)
        return buf.array()
    }
}

/**
 * Reassembled-Payload = Header+Data ohne das 4-byte Längen-Prefix. Äquivalent
 * zur TS-`ResponseReassembler.push`: erster Chunk trägt die Länge, Folgechunks
 * werden angehängt bis die deklarierte Länge voll ist.
 */
class Reassembler {
    private var buf: ByteArray = ByteArray(0)
    private var remaining: Int = 0
    private var writeOff: Int = 0

    fun push(chunk: ByteArray): ByteArray? {
        if (remaining == 0) {
            if (chunk.size < 4) return null
            val bb = ByteBuffer.wrap(chunk).order(ByteOrder.LITTLE_ENDIAN)
            val declared = bb.int
            if (declared <= 0) return null
            buf = ByteArray(declared)
            remaining = declared
            writeOff = 0
            val first = chunk.copyOfRange(4, chunk.size)
            val copyLen = minOf(first.size, remaining)
            System.arraycopy(first, 0, buf, writeOff, copyLen)
            writeOff += copyLen
            remaining -= copyLen
        } else {
            val copyLen = minOf(chunk.size, remaining)
            System.arraycopy(chunk, 0, buf, writeOff, copyLen)
            writeOff += copyLen
            remaining -= copyLen
        }
        return if (remaining == 0) {
            val out = buf
            buf = ByteArray(0)
            writeOff = 0
            out
        } else null
    }
}

data class ParsedResponse(val cmd: Int, val seq: Int, val data: ByteArray) {
    override fun equals(other: Any?): Boolean {
        if (this === other) return true
        if (other !is ParsedResponse) return false
        return cmd == other.cmd && seq == other.seq && data.contentEquals(other.data)
    }

    override fun hashCode(): Int {
        var result = cmd
        result = 31 * result + seq
        result = 31 * result + data.contentHashCode()
        return result
    }
}

fun parseResponse(reassembled: ByteArray): ParsedResponse? {
    if (reassembled.size < 4) return null
    val bb = ByteBuffer.wrap(reassembled).order(ByteOrder.LITTLE_ENDIAN)
    val cmd = bb.short.toInt() and 0xffff
    // skip reserved byte
    bb.get()
    val seqByte = bb.get().toInt() and 0x1f
    val data = reassembled.copyOfRange(4, reassembled.size)
    return ParsedResponse(cmd, seqByte, data)
}
