package at.ffnd.einsatzkarte.radiacode.transport

import at.ffnd.einsatzkarte.radiacode.protocol.BytesBuffer

/**
 * Common transport abstraction for radiacode protocol I/O.
 *
 * Implementations: [BluetoothTransport] (production), `FakeTransport` (tests).
 * Allows [at.ffnd.einsatzkarte.radiacode.RadiaCode] to be unit-tested without
 * a real BLE stack.
 *
 * `internal` because the only external consumer is [RadiaCode] which lives in
 * the same Gradle module.
 */
internal interface Transport {
    /**
     * Send [req] (a fully framed radiacode request including `<I>` length-prefix)
     * and synchronously wait for the matching response. Returns the response
     * body as a [BytesBuffer] positioned at offset 0 of the body (the 4-byte
     * length prefix has already been consumed by the transport).
     *
     * Concurrency: Implementations MUST serialize concurrent calls so that
     * one caller's response cannot be intercepted by another.
     *
     * @throws ConnectionClosed if the transport was closed or lost connection
     * @throws TransportTimeout if no complete response arrived within [timeoutMs]
     */
    @Throws(ConnectionClosed::class, TransportTimeout::class)
    fun execute(req: ByteArray, timeoutMs: Long = 10_000L): BytesBuffer

    /** Disconnects and releases resources. Idempotent. */
    fun close()
}
