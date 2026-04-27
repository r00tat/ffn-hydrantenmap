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
