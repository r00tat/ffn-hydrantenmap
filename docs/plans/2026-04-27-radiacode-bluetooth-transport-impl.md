# BluetoothTransport Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Port `radiacode-python/src/radiacode/transports/bluetooth.py` to a Kotlin class `BluetoothTransport` that owns the GATT session, mirrors the Python API, and serializes parallel `execute()` callers via a mutex.

**Architecture:** Single public class `BluetoothTransport` with Python-spiegelnder API. Internes `BleIo`-Interface trennt BLE-I/O von Protocol-Logic — Production verwendet `AndroidBleIo` (BluetoothGatt direkt), Tests verwenden `FakeBleIo`. Synchronisation via `ReentrantLock` + `Condition` (keine Coroutines).

**Tech Stack:** Kotlin/Android, JUnit4, `java.util.concurrent.locks.ReentrantLock`, Android BluetoothGatt API. Keine neuen Gradle-Dependencies.

**Design-Doc:** [`2026-04-27-radiacode-bluetooth-transport-design.md`](./2026-04-27-radiacode-bluetooth-transport-design.md)

**Lean-Plan-Konvention:** Keine Zwischen-Commits oder Zwischen-Checks pro Step. Block 1 + 2 werden in einem Rutsch geschrieben, Checks und Commit laufen einmal am Ende (Block 3).

---

## Verzeichnisstruktur

```
capacitor/android/app/src/main/java/at/ffnd/einsatzkarte/radiacode/transport/
  Exceptions.kt
  BleIo.kt
  AndroidBleIo.kt
  BluetoothTransport.kt

capacitor/android/app/src/test/java/at/ffnd/einsatzkarte/radiacode/transport/
  FakeBleIo.kt
  BluetoothTransportTest.kt
```

---

## Block 1: Test-Infrastruktur + alle Tests

Alle Schritte in diesem Block sind **eine zusammenhängende Schreibphase**. Kein Build/Test/Commit zwischendurch.

### Step 1.1: `Exceptions.kt`

**Datei (create):** `capacitor/android/app/src/main/java/at/ffnd/einsatzkarte/radiacode/transport/Exceptions.kt`

```kotlin
package at.ffnd.einsatzkarte.radiacode.transport

open class TransportException(message: String, cause: Throwable? = null) :
    Exception(message, cause)

class DeviceNotFound(message: String, cause: Throwable? = null) :
    TransportException(message, cause)

class ConnectionClosed(message: String, cause: Throwable? = null) :
    TransportException(message, cause)

class TransportTimeout(message: String) : TransportException(message)
```

### Step 1.2: `BleIo.kt`

**Datei (create):** `capacitor/android/app/src/main/java/at/ffnd/einsatzkarte/radiacode/transport/BleIo.kt`

```kotlin
package at.ffnd.einsatzkarte.radiacode.transport

/**
 * BLE-I/O-Abstraktion für [BluetoothTransport]. Trennt das Android-spezifische
 * GATT-Setup vom Protokoll-Layer (Reassembly + Sync), sodass die Protokoll-
 * Logik ohne Robolectric unit-getestet werden kann.
 *
 * Lifecycle:
 *  1. [connect] blockiert bis Verbindung steht und Notifications subscribed sind,
 *     oder wirft [DeviceNotFound] bei Fehler/Timeout. Nach erfolgreichem Connect
 *     liefert die Implementation eingehende Notifications via [notificationListener]
 *     und Verbindungsverlust via [connectionLostListener].
 *  2. [write] schreibt einen Chunk auf die Write-Charakteristik (kein Chunking
 *     hier — der Aufrufer übergibt bereits passende MTU-Chunks).
 *  3. [close] disconnected und gibt Ressourcen frei.
 */
internal interface BleIo {
    fun connect(
        notificationListener: (ByteArray) -> Unit,
        connectionLostListener: () -> Unit,
        connectTimeoutMs: Long,
    )

    fun write(bytes: ByteArray)

    fun close()
}
```

### Step 1.3: `FakeBleIo.kt` (Test-Helper)

**Datei (create):** `capacitor/android/app/src/test/java/at/ffnd/einsatzkarte/radiacode/transport/FakeBleIo.kt`

```kotlin
package at.ffnd.einsatzkarte.radiacode.transport

import java.util.concurrent.CopyOnWriteArrayList
import java.util.concurrent.atomic.AtomicBoolean

/**
 * In-Memory-Test-Doppel für [BleIo]. Die Tests injizieren
 * Notifications und steuern den Verbindungs-Lifecycle direkt.
 */
internal class FakeBleIo : BleIo {

    val writtenChunks: MutableList<ByteArray> = CopyOnWriteArrayList()

    @Volatile var blockConnect: Boolean = false
    @Volatile var failConnectWith: Throwable? = null

    private val closedFlag = AtomicBoolean(false)
    val isClosed: Boolean get() = closedFlag.get()

    @Volatile private var notificationListener: ((ByteArray) -> Unit)? = null
    @Volatile private var connectionLostListener: (() -> Unit)? = null

    override fun connect(
        notificationListener: (ByteArray) -> Unit,
        connectionLostListener: () -> Unit,
        connectTimeoutMs: Long,
    ) {
        failConnectWith?.let { throw it }
        if (blockConnect) {
            // Simuliere "no connect" — schlafe bis Timeout, werfe dann.
            Thread.sleep(connectTimeoutMs)
            throw DeviceNotFound("Connect timeout (simulated)")
        }
        this.notificationListener = notificationListener
        this.connectionLostListener = connectionLostListener
    }

    override fun write(bytes: ByteArray) {
        if (closedFlag.get()) throw ConnectionClosed("Closed (simulated)")
        writtenChunks.add(bytes.copyOf())
    }

    override fun close() {
        closedFlag.set(true)
        notificationListener = null
        connectionLostListener = null
    }

    /** Test-API: schiebt eine Notification an den Transport. */
    fun injectNotification(bytes: ByteArray) {
        notificationListener?.invoke(bytes)
    }

    /** Test-API: simuliert Disconnect — Transport soll wartende execute() abbrechen. */
    fun simulateDisconnect() {
        connectionLostListener?.invoke()
    }
}
```

### Step 1.4: `BluetoothTransportTest.kt`

**Datei (create):** `capacitor/android/app/src/test/java/at/ffnd/einsatzkarte/radiacode/transport/BluetoothTransportTest.kt`

```kotlin
package at.ffnd.einsatzkarte.radiacode.transport

import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertSame
import org.junit.Assert.assertThrows
import org.junit.Assert.assertTrue
import org.junit.Assert.fail
import org.junit.Test
import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicReference

class BluetoothTransportTest {

    /** Baut einen Frame `[len_le32 | payload]` für injectNotification. */
    private fun frame(payload: ByteArray): ByteArray {
        val buf = ByteBuffer.allocate(4 + payload.size).order(ByteOrder.LITTLE_ENDIAN)
        buf.putInt(payload.size)
        buf.put(payload)
        return buf.array()
    }

    private fun makeTransport(
        io: FakeBleIo,
        maxChunk: Int = 18,
        defaultTimeoutMs: Long = 1_000L,
        connectTimeoutMs: Long = 500L,
    ): BluetoothTransport =
        BluetoothTransport.forTesting(io, maxChunk, defaultTimeoutMs, connectTimeoutMs)

    // 1. Connect: Konstruktor registriert Listener am BleIo und kehrt zurück.
    @Test fun `connect succeeds and registers listeners`() {
        val io = FakeBleIo()
        val transport = makeTransport(io)
        // Wenn injectNotification etwas tut, ist der Listener registriert.
        // Wir testen das indirekt im nächsten Test-Case.
        transport.close()
        assertTrue(io.isClosed)
    }

    // 2. Connect-Timeout: BleIo blockiert → DeviceNotFound nach connectTimeout.
    @Test fun `connect timeout throws DeviceNotFound`() {
        val io = FakeBleIo().apply { blockConnect = true }
        assertThrows(DeviceNotFound::class.java) {
            makeTransport(io, connectTimeoutMs = 100L)
        }
    }

    // 3. Chunked Write: 40-Byte-Frame → 18 + 18 + 4.
    @Test fun `execute splits request into MTU-sized chunks`() {
        val io = FakeBleIo()
        val transport = makeTransport(io)
        val req = ByteArray(40) { (it and 0xff).toByte() }

        val responseFuture = Thread {
            transport.execute(req, timeoutMs = 1_000L)
        }
        responseFuture.start()
        // Warte kurz, damit execute() schreiben konnte.
        Thread.sleep(50)
        // Antwort schicken, damit execute() zurückkehrt.
        io.injectNotification(frame(byteArrayOf(0x01)))
        responseFuture.join(1_000L)

        assertEquals(3, io.writtenChunks.size)
        assertEquals(18, io.writtenChunks[0].size)
        assertEquals(18, io.writtenChunks[1].size)
        assertEquals(4, io.writtenChunks[2].size)
        // Inhalt == ursprünglicher req in Reihenfolge
        val concat = io.writtenChunks.flatMap { it.asList() }.toByteArray()
        assertArrayEquals(req, concat)

        transport.close()
    }

    // 4. Single-Notification-Response: kompletter Frame in einer Notification.
    @Test fun `execute returns BytesBuffer of payload without length prefix`() {
        val io = FakeBleIo()
        val transport = makeTransport(io)
        val payload = byteArrayOf(0x10, 0x20, 0x30, 0x40, 0x50, 0x60, 0x70, 0x80)
        val responseFuture = AtomicReference<ByteArray>()
        val t = Thread {
            val bb = transport.execute(byteArrayOf(0x01, 0x02))
            responseFuture.set(bb.remaining())
        }
        t.start()
        Thread.sleep(20)
        io.injectNotification(frame(payload))
        t.join(1_000L)

        assertArrayEquals(payload, responseFuture.get())
        transport.close()
    }

    // 5. Multi-Notification-Reassembly: Frame über 3 Chunks.
    @Test fun `execute reassembles multi-chunk response`() {
        val io = FakeBleIo()
        val transport = makeTransport(io)
        val payload = ByteArray(30) { (it + 1).toByte() }
        val full = frame(payload) // 4 + 30 = 34 Bytes
        val chunkA = full.copyOfRange(0, 16)   // [len + 12 Bytes payload]
        val chunkB = full.copyOfRange(16, 28)  // 12 Bytes payload
        val chunkC = full.copyOfRange(28, 34)  // 6 Bytes payload

        val ref = AtomicReference<ByteArray>()
        val t = Thread {
            val bb = transport.execute(byteArrayOf(0x01))
            ref.set(bb.remaining())
        }
        t.start()
        Thread.sleep(20)
        io.injectNotification(chunkA)
        io.injectNotification(chunkB)
        io.injectNotification(chunkC)
        t.join(1_000L)

        assertArrayEquals(payload, ref.get())
        transport.close()
    }

    // 6. Timeout: keine Notification → TransportTimeout.
    @Test fun `execute throws TransportTimeout when no response arrives`() {
        val io = FakeBleIo()
        val transport = makeTransport(io)
        assertThrows(TransportTimeout::class.java) {
            transport.execute(byteArrayOf(0x01), timeoutMs = 100L)
        }
        transport.close()
    }

    // 7. close() während execute() wartet → ConnectionClosed.
    @Test fun `close while execute is waiting throws ConnectionClosed`() {
        val io = FakeBleIo()
        val transport = makeTransport(io)
        val ref = AtomicReference<Throwable?>()
        val t = Thread {
            try {
                transport.execute(byteArrayOf(0x01), timeoutMs = 5_000L)
            } catch (e: Throwable) {
                ref.set(e)
            }
        }
        t.start()
        Thread.sleep(50)
        transport.close()
        t.join(1_000L)
        assertTrue(ref.get() is ConnectionClosed)
    }

    // 8. execute() nach close() → ConnectionClosed.
    @Test fun `execute after close throws ConnectionClosed`() {
        val io = FakeBleIo()
        val transport = makeTransport(io)
        transport.close()
        assertThrows(ConnectionClosed::class.java) {
            transport.execute(byteArrayOf(0x01), timeoutMs = 100L)
        }
    }

    // 9. Disconnect während execute() wartet → ConnectionClosed.
    @Test fun `disconnect during execute throws ConnectionClosed`() {
        val io = FakeBleIo()
        val transport = makeTransport(io)
        val ref = AtomicReference<Throwable?>()
        val t = Thread {
            try {
                transport.execute(byteArrayOf(0x01), timeoutMs = 5_000L)
            } catch (e: Throwable) {
                ref.set(e)
            }
        }
        t.start()
        Thread.sleep(50)
        io.simulateDisconnect()
        t.join(1_000L)
        assertTrue(ref.get() is ConnectionClosed)
    }

    // 10. Concurrent execute(): Mutex serialisiert.
    @Test fun `concurrent execute calls are serialized`() {
        val io = FakeBleIo()
        val transport = makeTransport(io)

        val started = CountDownLatch(2)
        val resultA = AtomicReference<ByteArray>()
        val resultB = AtomicReference<ByteArray>()

        val tA = Thread {
            started.countDown()
            val bb = transport.execute(byteArrayOf(0xAA.toByte()), timeoutMs = 2_000L)
            resultA.set(bb.remaining())
        }
        val tB = Thread {
            started.countDown()
            val bb = transport.execute(byteArrayOf(0xBB.toByte()), timeoutMs = 2_000L)
            resultB.set(bb.remaining())
        }
        tA.start()
        tB.start()
        started.await(1, TimeUnit.SECONDS)

        // Warte, bis genau ein Write angekommen ist (= ein execute hält den Lock).
        val deadline = System.nanoTime() + 1_000_000_000L
        while (io.writtenChunks.size < 1 && System.nanoTime() < deadline) {
            Thread.sleep(5)
        }
        assertEquals(1, io.writtenChunks.size)

        // Antwort für ersten Caller.
        io.injectNotification(frame(byteArrayOf(0x11)))

        // Jetzt muss der zweite Caller laufen → wartet auf Write.
        val deadline2 = System.nanoTime() + 1_000_000_000L
        while (io.writtenChunks.size < 2 && System.nanoTime() < deadline2) {
            Thread.sleep(5)
        }
        assertEquals(2, io.writtenChunks.size)

        // Antwort für zweiten Caller.
        io.injectNotification(frame(byteArrayOf(0x22)))

        tA.join(2_000L)
        tB.join(2_000L)

        // Wer war erster im Lock, sieht 0x11; der zweite sieht 0x22.
        // Reihenfolge ist nicht-deterministisch, aber die Bytes der ersten
        // Notification gehen an den ersten Write-Caller.
        val firstReq = io.writtenChunks[0][0]
        val secondReq = io.writtenChunks[1][0]
        if (firstReq == 0xAA.toByte()) {
            assertArrayEquals(byteArrayOf(0x11), resultA.get())
            assertArrayEquals(byteArrayOf(0x22), resultB.get())
            assertEquals(0xBB.toByte(), secondReq)
        } else {
            assertEquals(0xBB.toByte(), firstReq)
            assertArrayEquals(byteArrayOf(0x11), resultB.get())
            assertArrayEquals(byteArrayOf(0x22), resultA.get())
            assertEquals(0xAA.toByte(), secondReq)
        }

        transport.close()
    }

    // 11. Reset zwischen Calls: späte „Geister"-Notification verfälscht nicht
    //     den nächsten Call.
    @Test fun `reassembler is reset between execute calls`() {
        val io = FakeBleIo()
        val transport = makeTransport(io)

        // Call A: liefert Response.
        val refA = AtomicReference<ByteArray>()
        val tA = Thread {
            val bb = transport.execute(byteArrayOf(0x01))
            refA.set(bb.remaining())
        }
        tA.start()
        Thread.sleep(20)
        io.injectNotification(frame(byteArrayOf(0xAA.toByte())))
        tA.join(1_000L)
        assertArrayEquals(byteArrayOf(0xAA.toByte()), refA.get())

        // Geister-Notification zwischen den Calls (sollte resettet werden).
        io.injectNotification(frame(byteArrayOf(0xCC.toByte())))

        // Call B: liefert eigene Response.
        val refB = AtomicReference<ByteArray>()
        val tB = Thread {
            val bb = transport.execute(byteArrayOf(0x02))
            refB.set(bb.remaining())
        }
        tB.start()
        Thread.sleep(20)
        io.injectNotification(frame(byteArrayOf(0xBB.toByte())))
        tB.join(1_000L)

        assertArrayEquals(byteArrayOf(0xBB.toByte()), refB.get())
        transport.close()
    }

    // 12. Notification mit < 4 Byte als 1. Chunk → ignoriert.
    @Test fun `notification shorter than 4 bytes is ignored as first chunk`() {
        val io = FakeBleIo()
        val transport = makeTransport(io)
        val ref = AtomicReference<ByteArray>()
        val t = Thread {
            val bb = transport.execute(byteArrayOf(0x01), timeoutMs = 500L)
            ref.set(bb.remaining())
        }
        t.start()
        Thread.sleep(20)
        io.injectNotification(byteArrayOf(0x00, 0x00))     // ignoriert
        io.injectNotification(frame(byteArrayOf(0x42)))    // gültig
        t.join(1_000L)
        assertArrayEquals(byteArrayOf(0x42), ref.get())
        transport.close()
    }

    // 13. Negative deklarierte Länge → ignoriert.
    @Test fun `notification with non-positive declared length is ignored`() {
        val io = FakeBleIo()
        val transport = makeTransport(io)
        val ref = AtomicReference<ByteArray>()
        val t = Thread {
            val bb = transport.execute(byteArrayOf(0x01), timeoutMs = 500L)
            ref.set(bb.remaining())
        }
        t.start()
        Thread.sleep(20)
        // Längen-Prefix = -1
        val bogus = ByteBuffer.allocate(8).order(ByteOrder.LITTLE_ENDIAN)
            .putInt(-1).put(byteArrayOf(0x00, 0x00, 0x00, 0x00)).array()
        io.injectNotification(bogus)
        // Längen-Prefix = 0
        val zero = ByteBuffer.allocate(4).order(ByteOrder.LITTLE_ENDIAN)
            .putInt(0).array()
        io.injectNotification(zero)
        // Gültiger Frame
        io.injectNotification(frame(byteArrayOf(0x77)))
        t.join(1_000L)
        assertArrayEquals(byteArrayOf(0x77), ref.get())
        transport.close()
    }

    // 14. Notification mit mehr Bytes als deklariert → auf Länge gekappt.
    @Test fun `notification with surplus bytes is truncated to declared length`() {
        val io = FakeBleIo()
        val transport = makeTransport(io)
        val payload = byteArrayOf(0x01, 0x02, 0x03)
        val full = frame(payload)
        // Hänge 5 weitere Bytes an, die nicht zur Antwort gehören.
        val noisy = full + byteArrayOf(0xFF.toByte(), 0xFF.toByte(), 0xFF.toByte(), 0xFF.toByte(), 0xFF.toByte())
        val ref = AtomicReference<ByteArray>()
        val t = Thread {
            val bb = transport.execute(byteArrayOf(0x01))
            ref.set(bb.remaining())
        }
        t.start()
        Thread.sleep(20)
        io.injectNotification(noisy)
        t.join(1_000L)
        assertArrayEquals(payload, ref.get())
        transport.close()
    }

    // 15. Default-Timeout: execute() ohne timeoutMs nutzt defaultTimeoutMs.
    @Test fun `execute uses defaultTimeoutMs when not given`() {
        val io = FakeBleIo()
        val transport = makeTransport(io, defaultTimeoutMs = 100L)
        assertThrows(TransportTimeout::class.java) {
            transport.execute(byteArrayOf(0x01)) // kein timeoutMs → 100ms
        }
        transport.close()
    }

    // 16. execute() mit leerem Request: keine io.write-Calls, wartet trotzdem
    //     auf Response (1:1 Python-Verhalten — `range(0, 0, 18)` iteriert nicht).
    @Test fun `execute with empty request writes nothing but still waits for response`() {
        val io = FakeBleIo()
        val transport = makeTransport(io)
        val ref = AtomicReference<ByteArray>()
        val t = Thread {
            val bb = transport.execute(ByteArray(0))
            ref.set(bb.remaining())
        }
        t.start()
        Thread.sleep(50)
        assertEquals(0, io.writtenChunks.size)
        io.injectNotification(frame(byteArrayOf(0x55)))
        t.join(1_000L)
        assertArrayEquals(byteArrayOf(0x55), ref.get())
        transport.close()
    }
}
```

---

## Block 2: Implementation

Wieder eine zusammenhängende Schreibphase. Kein Build/Commit zwischendurch.

### Step 2.1: `BluetoothTransport.kt`

**Datei (create):** `capacitor/android/app/src/main/java/at/ffnd/einsatzkarte/radiacode/transport/BluetoothTransport.kt`

```kotlin
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
 * Concurrency: Mehrere parallele [execute]-Aufrufer werden über
 * [ReentrantLock] serialisiert — pro Call wird der interne Reassembler-
 * State zurückgesetzt, sodass kein State-Leak zwischen Calls möglich ist.
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
    private companion object {
        private const val TAG = "RadiacodeBT"
    }

    private val lock = ReentrantLock()
    private val responseReady = lock.newCondition()

    @Volatile private var closing = false
    @Volatile private var connectionLost = false

    // Reassembler-State — geschützt durch [lock].
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
        lock.withLock {
            if (closing) throw ConnectionClosed("Transport is closing")
            if (connectionLost) throw ConnectionClosed("Connection lost")

            // Reassembler-Reset: jeder Call startet frisch, damit eine späte
            // Geister-Notification aus einem vorherigen Call hier nicht
            // fälschlich als „die Antwort" zählt.
            assembling = null
            remaining = 0
            writeOff = 0
            currentResponse = null

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

    fun close() {
        lock.withLock {
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
        lock.withLock {
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
        lock.withLock {
            if (connectionLost) return
            connectionLost = true
            responseReady.signalAll()
        }
    }

    internal companion object {
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
```

### Step 2.2: `AndroidBleIo.kt`

**Datei (create):** `capacitor/android/app/src/main/java/at/ffnd/einsatzkarte/radiacode/transport/AndroidBleIo.kt`

Anmerkung: Diese Klasse läuft *nicht* unter den Unit-Tests, sondern wird am echten Gerät verifiziert. Sie kapselt das gesamte Android-GATT-Setup (Connect → MTU → Service-Discovery → CCCD-Write) hinter einem blockierenden `connect()`. Die Implementation orientiert sich an `GattSession`, ist aber bewusst schlanker — sie stellt nur die für `BluetoothTransport` notwendigen Operationen bereit.

```kotlin
package at.ffnd.einsatzkarte.radiacode.transport

import android.annotation.SuppressLint
import android.bluetooth.BluetoothAdapter
import android.bluetooth.BluetoothDevice
import android.bluetooth.BluetoothGatt
import android.bluetooth.BluetoothGattCallback
import android.bluetooth.BluetoothGattCharacteristic
import android.bluetooth.BluetoothGattDescriptor
import android.bluetooth.BluetoothManager
import android.bluetooth.BluetoothProfile
import android.content.Context
import android.os.Build
import android.util.Log
import at.ffnd.einsatzkarte.radiacode.Protocol
import java.util.UUID
import java.util.concurrent.locks.ReentrantLock
import kotlin.concurrent.withLock

@SuppressLint("MissingPermission")
internal class AndroidBleIo(
    private val ctx: Context,
    private val deviceAddress: String,
) : BleIo {

    private companion object {
        private const val TAG = "RadiacodeBTIo"
        private val SERVICE_UUID: UUID = UUID.fromString(Protocol.SERVICE_UUID)
        private val WRITE_UUID: UUID = UUID.fromString(Protocol.WRITE_CHAR_UUID)
        private val NOTIFY_UUID: UUID = UUID.fromString(Protocol.NOTIFY_CHAR_UUID)
        private val CCCD_UUID: UUID = UUID.fromString("00002902-0000-1000-8000-00805f9b34fb")
    }

    private val lock = ReentrantLock()
    private val ready = lock.newCondition()

    @Volatile private var gatt: BluetoothGatt? = null
    @Volatile private var writeChar: BluetoothGattCharacteristic? = null
    @Volatile private var notifyChar: BluetoothGattCharacteristic? = null
    @Volatile private var connected: Boolean = false
    @Volatile private var setupFailure: Throwable? = null
    @Volatile private var notificationListener: ((ByteArray) -> Unit)? = null
    @Volatile private var connectionLostListener: (() -> Unit)? = null

    override fun connect(
        notificationListener: (ByteArray) -> Unit,
        connectionLostListener: () -> Unit,
        connectTimeoutMs: Long,
    ) {
        this.notificationListener = notificationListener
        this.connectionLostListener = connectionLostListener

        val mgr = ctx.getSystemService(Context.BLUETOOTH_SERVICE) as? BluetoothManager
            ?: throw DeviceNotFound("BluetoothManager unavailable")
        val adapter: BluetoothAdapter = mgr.adapter
            ?: throw DeviceNotFound("BluetoothAdapter unavailable")
        val device: BluetoothDevice = try {
            adapter.getRemoteDevice(deviceAddress)
        } catch (e: IllegalArgumentException) {
            throw DeviceNotFound("Bad MAC: $deviceAddress", e)
        }

        Log.i(TAG, "Connecting GATT to $deviceAddress")
        gatt = device.connectGatt(ctx, false, gattCallback, BluetoothDevice.TRANSPORT_LE)

        lock.withLock {
            val deadline = System.nanoTime() + connectTimeoutMs * 1_000_000L
            while (!connected && setupFailure == null) {
                val rem = deadline - System.nanoTime()
                if (rem <= 0L) {
                    cleanupOnFailure()
                    throw DeviceNotFound("Connect timeout after ${connectTimeoutMs}ms")
                }
                try {
                    ready.awaitNanos(rem)
                } catch (ie: InterruptedException) {
                    Thread.currentThread().interrupt()
                    cleanupOnFailure()
                    throw DeviceNotFound("Interrupted during connect", ie)
                }
            }
            setupFailure?.let { f ->
                cleanupOnFailure()
                throw if (f is DeviceNotFound) f else DeviceNotFound("Connect failed", f)
            }
        }
    }

    override fun write(bytes: ByteArray) {
        val g = gatt ?: throw ConnectionClosed("No GATT")
        val ch = writeChar ?: throw ConnectionClosed("No writeChar")
        val ok = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            g.writeCharacteristic(ch, bytes, BluetoothGattCharacteristic.WRITE_TYPE_NO_RESPONSE) ==
                BluetoothGatt.GATT_SUCCESS
        } else {
            @Suppress("DEPRECATION")
            ch.value = bytes
            @Suppress("DEPRECATION")
            ch.writeType = BluetoothGattCharacteristic.WRITE_TYPE_NO_RESPONSE
            @Suppress("DEPRECATION")
            g.writeCharacteristic(ch)
        }
        if (!ok) {
            Log.w(TAG, "writeCharacteristic returned false")
            // Wir werfen hier nicht — der Aufrufer (BluetoothTransport.execute)
            // läuft danach in den Response-Wait und timeoutet sauber, falls
            // die Antwort tatsächlich ausbleibt.
        }
    }

    override fun close() {
        Log.i(TAG, "close()")
        try {
            gatt?.disconnect()
            gatt?.close()
        } catch (t: Throwable) {
            Log.w(TAG, "close exception", t)
        }
        gatt = null
        writeChar = null
        notifyChar = null
        notificationListener = null
        connectionLostListener = null
    }

    private fun cleanupOnFailure() {
        try {
            gatt?.disconnect()
            gatt?.close()
        } catch (_: Throwable) { /* best effort */ }
        gatt = null
        writeChar = null
        notifyChar = null
    }

    private fun signalReady() {
        lock.withLock {
            connected = true
            ready.signalAll()
        }
    }

    private fun signalFailure(t: Throwable) {
        lock.withLock {
            setupFailure = t
            ready.signalAll()
        }
    }

    private val gattCallback = object : BluetoothGattCallback() {
        override fun onConnectionStateChange(g: BluetoothGatt, status: Int, newState: Int) {
            Log.i(TAG, "onConnectionStateChange status=$status newState=$newState")
            if (newState == BluetoothProfile.STATE_CONNECTED && status == BluetoothGatt.GATT_SUCCESS) {
                g.requestMtu(Protocol.REQUESTED_MTU)
            } else {
                if (!connected) {
                    signalFailure(DeviceNotFound("connect state change status=$status newState=$newState"))
                } else {
                    // Disconnect nach erfolgreichem Connect → Aufrufer benachrichtigen.
                    connectionLostListener?.invoke()
                }
            }
        }

        override fun onMtuChanged(g: BluetoothGatt, mtu: Int, status: Int) {
            Log.i(TAG, "onMtuChanged mtu=$mtu status=$status")
            g.discoverServices()
        }

        override fun onServicesDiscovered(g: BluetoothGatt, status: Int) {
            if (status != BluetoothGatt.GATT_SUCCESS) {
                signalFailure(DeviceNotFound("Service discovery failed status=$status"))
                return
            }
            val service = g.getService(SERVICE_UUID)
                ?: return signalFailure(DeviceNotFound("Service $SERVICE_UUID not found"))
            writeChar = service.getCharacteristic(WRITE_UUID)
            notifyChar = service.getCharacteristic(NOTIFY_UUID)
            val nc = notifyChar
            if (writeChar == null || nc == null) {
                signalFailure(DeviceNotFound("Required characteristics missing"))
                return
            }
            g.setCharacteristicNotification(nc, true)
            val cccd = nc.getDescriptor(CCCD_UUID)
                ?: return signalFailure(DeviceNotFound("CCCD not found"))
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                g.writeDescriptor(cccd, BluetoothGattDescriptor.ENABLE_NOTIFICATION_VALUE)
            } else {
                @Suppress("DEPRECATION")
                cccd.value = BluetoothGattDescriptor.ENABLE_NOTIFICATION_VALUE
                @Suppress("DEPRECATION")
                g.writeDescriptor(cccd)
            }
        }

        override fun onDescriptorWrite(
            g: BluetoothGatt,
            descriptor: BluetoothGattDescriptor,
            status: Int,
        ) {
            if (descriptor.uuid != CCCD_UUID) return
            if (status == BluetoothGatt.GATT_SUCCESS) {
                signalReady()
            } else {
                signalFailure(DeviceNotFound("CCCD write failed status=$status"))
            }
        }

        override fun onCharacteristicChanged(
            g: BluetoothGatt,
            characteristic: BluetoothGattCharacteristic,
            value: ByteArray,
        ) {
            if (characteristic.uuid == NOTIFY_UUID) {
                notificationListener?.invoke(value)
            }
        }

        @Deprecated("API ≤ 32: value kommt nicht im Callback")
        override fun onCharacteristicChanged(
            g: BluetoothGatt,
            characteristic: BluetoothGattCharacteristic,
        ) {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) return
            if (characteristic.uuid == NOTIFY_UUID) {
                @Suppress("DEPRECATION")
                val v = characteristic.value ?: return
                notificationListener?.invoke(v.copyOf())
            }
        }
    }
}
```

---

## Block 3: Verify + Commit

### Step 3.1: Lint, Tests, Build (alle drei am Ende)

Reihenfolge so, dass die Quelle eines Fehlers eindeutig ist.

```bash
cd capacitor/android && JAVA_HOME=$(/usr/libexec/java_home -v 21) ./gradlew :app:testDebugUnitTest
```

Erwartet: `BUILD SUCCESSFUL`, alle Tests in `BluetoothTransportTest` grün (16 Tests). Falls ein Test rot ist: zur Implementation in [BluetoothTransport.kt](capacitor/android/app/src/main/java/at/ffnd/einsatzkarte/radiacode/transport/BluetoothTransport.kt) zurückkehren und fixen. Nach dem Fix den Test-Run wiederholen.

```bash
cd capacitor/android && JAVA_HOME=$(/usr/libexec/java_home -v 21) ./gradlew :app:assembleDebug
```

Erwartet: `BUILD SUCCESSFUL`. Falls Compile-Fehler in `AndroidBleIo`: fixen, Build erneut.

### Step 3.2: Commit

```bash
git add capacitor/android/app/src/main/java/at/ffnd/einsatzkarte/radiacode/transport/
git add capacitor/android/app/src/test/java/at/ffnd/einsatzkarte/radiacode/transport/
git add docs/plans/2026-04-27-radiacode-bluetooth-transport-impl.md
git commit -m "feat(radiacode): BluetoothTransport mit Mutex-serialisiertem execute() (Port von bluetooth.py)"
```

---

## Hinweise für den Executor

- **Lean-Plan-Konvention beachten:** Die Schritte innerhalb von Block 1 und Block 2 werden ohne Zwischen-Commits oder Zwischen-Builds durchgezogen. Erst Block 3 läuft Tests + Build, gefolgt von einem Commit.
- **Dateipfade absolut zur Repo-Root** verwenden (`capacitor/android/app/src/...`).
- **Imports**: `at.ffnd.einsatzkarte.radiacode.protocol.BytesBuffer` ist die Klasse aus dem vorigen Schritt (DataBuf-Decoder-Port). `at.ffnd.einsatzkarte.radiacode.Protocol` enthält die UUIDs und MTU-Konstanten.
- **JDK 21**: Build und Tests müssen mit `JAVA_HOME=$(/usr/libexec/java_home -v 21)` laufen (siehe `CLAUDE.md`).
- **Keine Änderung an `GattSession`/`Framing`/`Reassembler`/`RadiacodeForegroundService`** in diesem Plan — der Transport existiert parallel zur bestehenden Pipeline.
