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
import java.util.UUID
import java.util.concurrent.atomic.AtomicBoolean
import java.util.concurrent.locks.ReentrantLock
import kotlin.concurrent.withLock

@SuppressLint("MissingPermission")
internal class AndroidBleIo(
    private val ctx: Context,
    private val deviceAddress: String,
) : BleIo {

    private companion object {
        private const val TAG = "RadiacodeBTIo"
        // Radiacode-Service-/Char-UUIDs (proprietäres Protokoll, dokumentiert in
        // `radiacode-python/src/radiacode/transports/bluetooth.py`).
        private val SERVICE_UUID: UUID = UUID.fromString("e63215e5-7003-49d8-96b0-b024798fb901")
        private val WRITE_UUID: UUID = UUID.fromString("e63215e6-7003-49d8-96b0-b024798fb901")
        private val NOTIFY_UUID: UUID = UUID.fromString("e63215e7-7003-49d8-96b0-b024798fb901")
        private val CCCD_UUID: UUID = UUID.fromString("00002902-0000-1000-8000-00805f9b34fb")
        private const val REQUESTED_MTU: Int = 250
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
    private val lostNotified = AtomicBoolean(false)

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

        // Failure innerhalb des Locks ermitteln, Cleanup + Throw außerhalb —
        // gatt.disconnect() kann auf manchen Android-Stacks synchron
        // onConnectionStateChange triggern und würde den Lock reentrant
        // akquirieren.
        val failure: Throwable? = lock.withLock {
            val deadline = System.nanoTime() + connectTimeoutMs * 1_000_000L
            while (!connected && setupFailure == null) {
                val rem = deadline - System.nanoTime()
                if (rem <= 0L) {
                    return@withLock DeviceNotFound("Connect timeout after ${connectTimeoutMs}ms")
                }
                try {
                    ready.awaitNanos(rem)
                } catch (ie: InterruptedException) {
                    Thread.currentThread().interrupt()
                    return@withLock DeviceNotFound("Interrupted during connect", ie)
                }
            }
            setupFailure
        }

        if (failure != null) {
            cleanupOnFailure()
            throw if (failure is DeviceNotFound) failure
            else DeviceNotFound("Connect failed", failure)
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
            // Mitten in einem Frame würde ein verschluckter Fehler den
            // Reassembler des Geräts wedgen — fail-fast, damit der Aufrufer
            // einen frischen Transport aufbauen kann.
            Log.w(TAG, "writeCharacteristic returned false")
            throw ConnectionClosed("writeCharacteristic returned false")
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
                g.requestMtu(REQUESTED_MTU)
            } else {
                if (!connected) {
                    signalFailure(DeviceNotFound("connect state change status=$status newState=$newState"))
                } else if (lostNotified.compareAndSet(false, true)) {
                    // Disconnect nach erfolgreichem Connect → Aufrufer genau einmal
                    // benachrichtigen (Android-Stacks liefern oft mehrere
                    // STATE_DISCONNECTED-Callbacks für ein Disconnect-Event).
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

        @Suppress("OVERRIDE_DEPRECATION")
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
