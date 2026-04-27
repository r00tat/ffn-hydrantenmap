package at.ffnd.einsatzkarte.radiacode.transport

import android.content.Context
import android.util.Log
import at.ffnd.einsatzkarte.radiacode.protocol.BytesBuffer
import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.util.concurrent.locks.ReentrantLock
import kotlin.concurrent.withLock

/**
 * Kotlin-Port von `radiacode.transports.bluetooth.Bluetooth` — eine
 * Transport-Klasse, die die GATT-Session selbst hält, Requests chunked
 * sendet und synchron auf die zusammengesetzte Response wartet.
 *
 * Concurrency: Mehrere parallele [execute]-Aufrufer werden über einen
 * äußeren Serialization-Mutex serialisiert — der Mutex bleibt während
 * des kompletten Calls (Write + Wait) gehalten, sodass kein zweiter
 * Caller schreiben kann, bevor der erste seine Response hat. Pro Call
 * wird der interne Reassembler-State zurückgesetzt, sodass kein State-
 * Leak zwischen Calls möglich ist. Der Notification-Listener läuft auf
 * einem separaten State-Lock, damit er den Serialization-Mutex nicht
 * benötigt.
 *
 * Lifecycle (analog Python):
 *  - Konstruktor blockiert bis Verbindung steht (oder wirft [DeviceNotFound]).
 *  - [execute] sendet einen Frame und wartet auf die Response.
 *  - [close] disconnected; wartende [execute]-Caller bekommen [ConnectionClosed].
 *
 * Bei Disconnect ist die Instanz tot — kein Auto-Reconnect (siehe Design-Doc).
 */
class BluetoothTransport private constructor(
    private val io: BleIo,
    private val maxChunk: Int,
    private val defaultTimeoutMs: Long,
    connectTimeoutMs: Long,
) {
    /** Outer mutex — serialisiert komplette execute()-Calls. */
    private val executeLock = ReentrantLock()

    /** Inner state lock — schützt Reassembler/Response-State und die Condition. */
    private val stateLock = ReentrantLock()
    private val responseReady = stateLock.newCondition()

    @Volatile private var closing = false
    @Volatile private var connectionLost = false

    // Reassembler-State — geschützt durch [stateLock].
    private var assembling: ByteArray? = null
    private var remaining: Int = 0
    private var writeOff: Int = 0
    private var currentResponse: ByteArray? = null

    init {
        try {
            io.connect(::handleNotification, ::handleConnectionLost, connectTimeoutMs)
        } catch (e: Throwable) {
            try { io.close() } catch (_: Throwable) { /* best effort */ }
            throw e
        }
    }

    /**
     * Production-Konstruktor: erzeugt intern eine [AndroidBleIo].
     *
     * **Wichtig:** Blockiert den aufrufenden Thread bis die GATT-Session
     * steht. Darf nicht vom Main-Thread aufgerufen werden.
     */
    constructor(
        ctx: Context,
        deviceAddress: String,
        maxChunk: Int = 18,
        defaultTimeoutMs: Long = 10_000L,
        connectTimeoutMs: Long = 15_000L,
    ) : this(
        AndroidBleIo(ctx, deviceAddress),
        maxChunk,
        defaultTimeoutMs,
        connectTimeoutMs,
    )

    @Throws(ConnectionClosed::class, TransportTimeout::class)
    fun execute(req: ByteArray, timeoutMs: Long = defaultTimeoutMs): BytesBuffer {
        executeLock.withLock {
            if (closing) throw ConnectionClosed("Transport is closing")
            if (connectionLost) throw ConnectionClosed("Connection lost")

            // Reassembler-Reset: jeder Call startet frisch, damit eine späte
            // Geister-Notification aus einem vorherigen Call hier nicht
            // fälschlich als „die Antwort" zählt.
            stateLock.withLock {
                assembling = null
                remaining = 0
                writeOff = 0
                currentResponse = null
            }

            // Chunked write — Python: `for pos in range(0, len(req), 18)`.
            var off = 0
            while (off < req.size) {
                val end = minOf(off + maxChunk, req.size)
                try {
                    io.write(req.copyOfRange(off, end))
                } catch (e: ConnectionClosed) {
                    throw e
                } catch (e: Throwable) {
                    throw ConnectionClosed("write failed", e)
                }
                off = end
            }

            // Auf Response warten.
            val deadline = System.nanoTime() + timeoutMs * 1_000_000L
            stateLock.withLock {
                while (currentResponse == null && !closing && !connectionLost) {
                    val rem = deadline - System.nanoTime()
                    if (rem <= 0L) {
                        throw TransportTimeout("Response timeout after ${timeoutMs}ms")
                    }
                    try {
                        responseReady.awaitNanos(rem)
                    } catch (ie: InterruptedException) {
                        Thread.currentThread().interrupt()
                        throw ConnectionClosed("Interrupted while waiting for response", ie)
                    }
                }
                if (closing) throw ConnectionClosed("Closed while waiting for response")
                if (connectionLost) throw ConnectionClosed("Disconnected while waiting for response")

                val resp = currentResponse!!
                currentResponse = null
                return BytesBuffer(resp)
            }
        }
    }

    fun close() {
        stateLock.withLock {
            if (closing) return
            closing = true
            responseReady.signalAll()
        }
        try {
            io.close()
        } catch (t: Throwable) {
            Log.w(TAG, "io.close() failed", t)
        }
    }

    private fun handleNotification(bytes: ByteArray) {
        stateLock.withLock {
            if (remaining == 0 && assembling == null) {
                if (bytes.size < 4) return
                val declared = ByteBuffer.wrap(bytes, 0, 4)
                    .order(ByteOrder.LITTLE_ENDIAN)
                    .int
                if (declared <= 0) return
                val buf = ByteArray(declared)
                assembling = buf
                remaining = declared
                writeOff = 0
                val payloadLen = bytes.size - 4
                val copyLen = minOf(payloadLen, remaining)
                if (copyLen > 0) {
                    System.arraycopy(bytes, 4, buf, writeOff, copyLen)
                    writeOff += copyLen
                    remaining -= copyLen
                }
            } else {
                val a = assembling ?: return
                val copyLen = minOf(bytes.size, remaining)
                if (copyLen > 0) {
                    System.arraycopy(bytes, 0, a, writeOff, copyLen)
                    writeOff += copyLen
                    remaining -= copyLen
                }
            }
            if (remaining == 0 && assembling != null) {
                currentResponse = assembling
                assembling = null
                writeOff = 0
                responseReady.signalAll()
            }
        }
    }

    private fun handleConnectionLost() {
        stateLock.withLock {
            if (connectionLost) return
            connectionLost = true
            responseReady.signalAll()
        }
    }

    companion object {
        private const val TAG = "RadiacodeBT"

        /**
         * Test-Hook — erzeugt eine Instanz mit injiziertem [BleIo],
         * ohne Android-SDK-Aufrufe. Sichtbarkeit `internal` reicht, weil
         * Tests im selben Gradle-Modul laufen.
         */
        internal fun forTesting(
            io: BleIo,
            maxChunk: Int = 18,
            defaultTimeoutMs: Long = 10_000L,
            connectTimeoutMs: Long = 1_000L,
        ): BluetoothTransport =
            BluetoothTransport(io, maxChunk, defaultTimeoutMs, connectTimeoutMs)
    }
}
