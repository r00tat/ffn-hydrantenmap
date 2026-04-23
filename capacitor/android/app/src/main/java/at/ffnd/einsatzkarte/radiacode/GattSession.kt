package at.ffnd.einsatzkarte.radiacode

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
import android.os.Handler
import android.os.HandlerThread
import android.util.Log
import java.util.ArrayDeque
import java.util.UUID

interface SessionListener {
    fun onConnected()
    fun onDisconnected()
    fun onReconnecting()
    fun onNotification(bytes: ByteArray)
}

/**
 * Radiacode-BLE-Session mit Auto-Reconnect und serialisierter Write-Queue.
 * Läuft auf einem eigenen Handler-Thread, damit die GATT-Callbacks nicht im
 * Main-Looper landen (Android dokumentiert das nicht garantiert, aber in der
 * Praxis hilft es beim Throughput).
 *
 * Parallelität: Writes aus [sendWrite] werden FIFO-serialisiert. Jeder Frame
 * wird vorher in MTU-Chunks zerlegt und dann einer nach dem anderen
 * geschrieben — `writeCharacteristic` ist laut Android-SDK zwar
 * Write-Without-Response, aber mehrere sofortige Writes überlasten das
 * Android-GATT-Backend. Wir warten daher auf `onCharacteristicWrite` bevor
 * der nächste Chunk rausgeht.
 */
@SuppressLint("MissingPermission")
class GattSession(
    private val ctx: Context,
    val deviceAddress: String,
    private val listener: SessionListener,
) {
    private companion object {
        private const val TAG = "RadiacodeGatt"
        private val SERVICE_UUID = UUID.fromString(Protocol.SERVICE_UUID)
        private val WRITE_UUID = UUID.fromString(Protocol.WRITE_CHAR_UUID)
        private val NOTIFY_UUID = UUID.fromString(Protocol.NOTIFY_CHAR_UUID)
        private val CCCD_UUID = UUID.fromString("00002902-0000-1000-8000-00805f9b34fb")
        private val BACKOFF_MS = longArrayOf(1_000, 2_000, 4_000, 8_000, 16_000, 30_000)
    }

    private val thread = HandlerThread("RadiacodeGatt").also { it.start() }
    private val handler = Handler(thread.looper)

    @Volatile private var gatt: BluetoothGatt? = null
    @Volatile private var writeChar: BluetoothGattCharacteristic? = null
    @Volatile private var notifyChar: BluetoothGattCharacteristic? = null
    @Volatile private var connected = false
    @Volatile private var wantConnected = false
    @Volatile private var reconnectAttempt = 0

    private val writeQueue: ArrayDeque<ByteArray> = ArrayDeque()
    private var writeInFlight = false

    fun connect() {
        handler.post {
            wantConnected = true
            reconnectAttempt = 0
            openGatt()
        }
    }

    fun disconnect() {
        handler.post {
            Log.i(TAG, "disconnect() called — wantConnected=false")
            wantConnected = false
            writeQueue.clear()
            writeInFlight = false
            closeGatt()
        }
    }

    fun release() {
        Log.i(TAG, "release() called")
        disconnect()
        handler.postDelayed({ thread.quitSafely() }, 500)
    }

    fun sendWrite(frame: ByteArray) {
        handler.post {
            val chunks = Framing.splitForWrite(frame)
            for (c in chunks) writeQueue.add(c)
            pumpWrite()
        }
    }

    private fun openGatt() {
        if (!wantConnected) return
        val mgr = ctx.getSystemService(Context.BLUETOOTH_SERVICE) as? BluetoothManager
        val adapter: BluetoothAdapter? = mgr?.adapter
        if (adapter == null) {
            Log.w(TAG, "BluetoothAdapter unavailable")
            listener.onDisconnected()
            scheduleReconnect()
            return
        }
        val device: BluetoothDevice = try {
            adapter.getRemoteDevice(deviceAddress)
        } catch (e: IllegalArgumentException) {
            Log.w(TAG, "Bad MAC $deviceAddress", e)
            return
        }
        Log.i(TAG, "Opening GATT to $deviceAddress (attempt=$reconnectAttempt)")
        gatt = device.connectGatt(ctx, false, gattCallback, BluetoothDevice.TRANSPORT_LE)
    }

    private fun closeGatt() {
        Log.i(TAG, "closeGatt — wasConnected=$connected gatt=${gatt != null}")
        connected = false
        try {
            gatt?.disconnect()
            gatt?.close()
        } catch (e: Exception) {
            Log.w(TAG, "closeGatt exception", e)
        }
        gatt = null
        writeChar = null
        notifyChar = null
    }

    private fun scheduleReconnect() {
        if (!wantConnected) return
        listener.onReconnecting()
        val idx = minOf(reconnectAttempt, BACKOFF_MS.size - 1)
        val delay = BACKOFF_MS[idx]
        reconnectAttempt++
        Log.i(TAG, "Reconnect in ${delay}ms (attempt=$reconnectAttempt)")
        handler.postDelayed({
            if (wantConnected) {
                closeGatt()
                openGatt()
            }
        }, delay)
    }

    private fun pumpWrite() {
        if (writeInFlight) return
        if (!connected) return
        val g = gatt ?: return
        val ch = writeChar ?: return
        val next = writeQueue.pollFirst() ?: return
        writeInFlight = true
        ch.writeType = BluetoothGattCharacteristic.WRITE_TYPE_NO_RESPONSE
        val ok = if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.TIRAMISU) {
            g.writeCharacteristic(
                ch,
                next,
                BluetoothGattCharacteristic.WRITE_TYPE_NO_RESPONSE,
            ) == BluetoothGatt.GATT_SUCCESS
        } else {
            @Suppress("DEPRECATION")
            ch.value = next
            @Suppress("DEPRECATION")
            g.writeCharacteristic(ch)
        }
        if (!ok) {
            Log.w(TAG, "writeCharacteristic returned false — drop chunk, continue")
            writeInFlight = false
            pumpWrite()
        }
    }

    private val gattCallback = object : BluetoothGattCallback() {
        override fun onConnectionStateChange(g: BluetoothGatt, status: Int, newState: Int) {
            Log.i(
                TAG,
                "onConnectionStateChange status=$status state=$newState wantConnected=$wantConnected wasConnected=$connected",
            )
            if (newState == BluetoothProfile.STATE_CONNECTED && status == BluetoothGatt.GATT_SUCCESS) {
                // Request higher MTU first; service discovery wird danach angestossen.
                g.requestMtu(Protocol.REQUESTED_MTU)
            } else {
                connected = false
                writeInFlight = false
                writeQueue.clear()
                if (wantConnected) {
                    Log.w(TAG, "Unexpected disconnect (status=$status) — scheduling reconnect")
                    listener.onDisconnected()
                    scheduleReconnect()
                } else {
                    Log.i(TAG, "Disconnect acknowledged (wantConnected=false)")
                    listener.onDisconnected()
                }
            }
        }

        override fun onMtuChanged(g: BluetoothGatt, mtu: Int, status: Int) {
            Log.i(TAG, "onMtuChanged mtu=$mtu status=$status")
            g.discoverServices()
        }

        override fun onServicesDiscovered(g: BluetoothGatt, status: Int) {
            if (status != BluetoothGatt.GATT_SUCCESS) {
                Log.w(TAG, "Service discovery failed status=$status")
                scheduleReconnect()
                return
            }
            val service = g.getService(SERVICE_UUID)
            if (service == null) {
                Log.w(TAG, "Radiacode service not found on $deviceAddress")
                scheduleReconnect()
                return
            }
            writeChar = service.getCharacteristic(WRITE_UUID)
            notifyChar = service.getCharacteristic(NOTIFY_UUID)
            val nc = notifyChar
            if (writeChar == null || nc == null) {
                Log.w(TAG, "Radiacode characteristics missing")
                scheduleReconnect()
                return
            }
            g.setCharacteristicNotification(nc, true)
            val cccd = nc.getDescriptor(CCCD_UUID)
            if (cccd != null) {
                if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.TIRAMISU) {
                    g.writeDescriptor(cccd, BluetoothGattDescriptor.ENABLE_NOTIFICATION_VALUE)
                } else {
                    @Suppress("DEPRECATION")
                    cccd.value = BluetoothGattDescriptor.ENABLE_NOTIFICATION_VALUE
                    @Suppress("DEPRECATION")
                    g.writeDescriptor(cccd)
                }
            } else {
                // Ohne CCCD kein Notification-Fluss — versuche es trotzdem.
                onSubscribed()
            }
        }

        override fun onDescriptorWrite(g: BluetoothGatt, descriptor: BluetoothGattDescriptor, status: Int) {
            if (descriptor.uuid == CCCD_UUID) {
                if (status == BluetoothGatt.GATT_SUCCESS) {
                    onSubscribed()
                } else {
                    Log.w(TAG, "CCCD write failed status=$status")
                    scheduleReconnect()
                }
            }
        }

        override fun onCharacteristicChanged(
            g: BluetoothGatt,
            characteristic: BluetoothGattCharacteristic,
            value: ByteArray,
        ) {
            if (characteristic.uuid == NOTIFY_UUID) {
                listener.onNotification(value)
            }
        }

        @Deprecated("Deprecated on API 33+, value wird dort über die neue Überladung geliefert")
        override fun onCharacteristicChanged(
            g: BluetoothGatt,
            characteristic: BluetoothGattCharacteristic,
        ) {
            if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.TIRAMISU) return
            if (characteristic.uuid == NOTIFY_UUID) {
                @Suppress("DEPRECATION")
                val value = characteristic.value ?: return
                listener.onNotification(value.copyOf())
            }
        }

        override fun onCharacteristicWrite(
            g: BluetoothGatt,
            characteristic: BluetoothGattCharacteristic,
            status: Int,
        ) {
            if (status != BluetoothGatt.GATT_SUCCESS) {
                Log.w(TAG, "onCharacteristicWrite status=$status — continuing queue")
            }
            writeInFlight = false
            pumpWrite()
        }
    }

    private fun onSubscribed() {
        Log.i(TAG, "onSubscribed — notifications enabled, session ready")
        connected = true
        reconnectAttempt = 0
        listener.onConnected()
        pumpWrite()
    }
}
