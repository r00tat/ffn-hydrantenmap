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
