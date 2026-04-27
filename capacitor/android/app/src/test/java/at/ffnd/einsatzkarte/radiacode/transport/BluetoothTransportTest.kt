package at.ffnd.einsatzkarte.radiacode.transport

import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertThrows
import org.junit.Assert.assertTrue
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
        val payload = byteArrayOf(0x10, 0x20, 0x30, 0x40, 0x50, 0x60, 0x70, 0x80.toByte())
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
