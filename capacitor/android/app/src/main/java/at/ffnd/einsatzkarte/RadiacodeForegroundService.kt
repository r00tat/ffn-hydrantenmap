package at.ffnd.einsatzkarte

import android.Manifest
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import android.os.PowerManager
import android.util.Log
import androidx.core.app.NotificationCompat
import androidx.core.app.ServiceCompat
import androidx.core.content.ContextCompat
import at.ffnd.einsatzkarte.radiacode.Framing
import at.ffnd.einsatzkarte.radiacode.GattSession
import at.ffnd.einsatzkarte.radiacode.MeasurementDecoder
import at.ffnd.einsatzkarte.radiacode.Protocol
import at.ffnd.einsatzkarte.radiacode.Reassembler
import at.ffnd.einsatzkarte.radiacode.SessionListener
import at.ffnd.einsatzkarte.radiacode.parseResponse
import java.util.Date
import java.util.concurrent.Executors
import java.util.concurrent.ScheduledExecutorService
import java.util.concurrent.ScheduledFuture
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicInteger

/**
 * Foreground-Service + nativer Radiacode-BLE-Owner. Läuft solange mindestens
 * ein Client verbunden ist und hält CPU/Notification am Leben (siehe Phase 1).
 *
 * Neu gegenüber Phase 1: Wenn ACTION_BLE_CONNECT reinkommt, übernimmt der
 * Service exklusiv die BLE-Session (GattSession) und pollt DATA_BUF im
 * nativen Code. Measurements + Notifications gehen per Plugin-Event an den
 * WebView. Passthrough-Writes (ACTION_BLE_WRITE) erlauben dem TS-Client
 * weiterhin Spektrum/Settings-Zugriff über denselben GATT-Kanal.
 */
class RadiacodeForegroundService : Service() {

    companion object {
        const val CHANNEL_ID = "radiacode_connection"
        const val NOTIFICATION_ID = 4711
        const val WAKE_LOCK_TAG = "einsatzkarte:radiacode"

        const val ACTION_START = "at.ffnd.einsatzkarte.RADIACODE_START"
        const val ACTION_UPDATE = "at.ffnd.einsatzkarte.RADIACODE_UPDATE"
        const val ACTION_STOP = "at.ffnd.einsatzkarte.RADIACODE_STOP"
        const val ACTION_DISCONNECT_REQUESTED = "at.ffnd.einsatzkarte.RADIACODE_DISCONNECT_REQUESTED"
        const val ACTION_BLE_CONNECT = "at.ffnd.einsatzkarte.RADIACODE_BLE_CONNECT"
        const val ACTION_BLE_WRITE = "at.ffnd.einsatzkarte.RADIACODE_BLE_WRITE"
        const val ACTION_BLE_DISCONNECT = "at.ffnd.einsatzkarte.RADIACODE_BLE_DISCONNECT"

        const val EXTRA_TITLE = "title"
        const val EXTRA_BODY = "body"
        const val EXTRA_DEVICE_ADDRESS = "deviceAddress"
        const val EXTRA_PAYLOAD = "payload"

        private const val TAG = "RadiacodeFg"
        private const val POLL_INTERVAL_MS = 500L

        fun startIntent(ctx: Context, title: String, body: String): Intent =
            Intent(ctx, RadiacodeForegroundService::class.java).apply {
                action = ACTION_START
                putExtra(EXTRA_TITLE, title)
                putExtra(EXTRA_BODY, body)
            }

        fun updateIntent(ctx: Context, title: String, body: String): Intent =
            Intent(ctx, RadiacodeForegroundService::class.java).apply {
                action = ACTION_UPDATE
                putExtra(EXTRA_TITLE, title)
                putExtra(EXTRA_BODY, body)
            }

        fun stopIntent(ctx: Context): Intent =
            Intent(ctx, RadiacodeForegroundService::class.java).apply {
                action = ACTION_STOP
            }
    }

    private var wakeLock: PowerManager.WakeLock? = null
    private var lastTitle: String = "Radiacode verbunden"
    private var lastBody: String = ""

    private var session: GattSession? = null
    private val reassembler = Reassembler()
    private val seqIndex = AtomicInteger(0)
    private var pollSeq: Int = -1
    @Volatile private var deviceReady = false

    private var pollExecutor: ScheduledExecutorService? = null
    private var pollTask: ScheduledFuture<*>? = null

    override fun onCreate() {
        super.onCreate()
        ensureChannel()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        // Jede Action promoviert den Service in den Foreground-Status. Wurde er
        // via startForegroundService() gestartet, muss startForeground() sowieso
        // innerhalb von 10 s folgen; bei startService() (z.B. ACTION_UPDATE auf
        // laufendem Service) ist der Call idempotent und aktualisiert nur die
        // Notification. Entscheidend: Ab Android 14 (API 34+) MUSS die 3-arg-
        // Variante mit Service-Typ aufgerufen werden, sonst crasht der Service
        // mit MissingForegroundServiceTypeException — und reisst unsere
        // BLE-Session mit sich. Siehe Bug-Report vom 2026-04-22.
        val action = intent?.action
        if (action == ACTION_START || action == ACTION_UPDATE) {
            intent.getStringExtra(EXTRA_TITLE)?.let { lastTitle = it }
            intent.getStringExtra(EXTRA_BODY)?.let { lastBody = it }
        }
        if (action != null && action != ACTION_STOP && action != ACTION_DISCONNECT_REQUESTED) {
            ensureForeground()
        }

        when (action) {
            ACTION_START -> {
                acquireWakeLock()
            }
            ACTION_UPDATE -> {
                // ensureForeground() oben aktualisiert die Notification bereits.
            }
            ACTION_STOP -> {
                teardownSession()
                releaseWakeLock()
                stopForeground(STOP_FOREGROUND_REMOVE)
                stopSelf()
            }
            ACTION_DISCONNECT_REQUESTED -> {
                RadiacodeNotificationPlugin.onDisconnectRequested()
            }
            ACTION_BLE_CONNECT -> {
                val address = intent.getStringExtra(EXTRA_DEVICE_ADDRESS)
                if (address.isNullOrBlank()) {
                    Log.w(TAG, "ACTION_BLE_CONNECT without deviceAddress")
                } else {
                    acquireWakeLock()
                    startBleSession(address)
                }
            }
            ACTION_BLE_WRITE -> {
                val payload = intent.getByteArrayExtra(EXTRA_PAYLOAD)
                if (payload == null) {
                    Log.w(TAG, "ACTION_BLE_WRITE without payload")
                } else {
                    session?.sendWrite(payload) ?: Log.w(TAG, "ACTION_BLE_WRITE but no session")
                }
            }
            ACTION_BLE_DISCONNECT -> {
                teardownSession()
            }
        }
        return START_NOT_STICKY
    }

    private fun ensureForeground() {
        val notif = buildNotification(lastTitle, lastBody)
        val type = resolveForegroundServiceType()
        ServiceCompat.startForeground(this, NOTIFICATION_ID, notif, type)
    }

    /**
     * Kombiniert CONNECTED_DEVICE (für BLE) und LOCATION (damit
     * `navigator.geolocation.watchPosition()` im WebView auch bei
     * gesperrtem Screen weiterläuft). LOCATION wird nur addiert, wenn
     * ACCESS_FINE_LOCATION tatsächlich runtime-granted ist — sonst
     * wirft Android 14+ bei startForeground() SecurityException und
     * killt den Service (und damit die BLE-Session).
     */
    private fun resolveForegroundServiceType(): Int {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) return 0
        var type = ServiceInfo.FOREGROUND_SERVICE_TYPE_CONNECTED_DEVICE
        val fine = ContextCompat.checkSelfPermission(
            this, Manifest.permission.ACCESS_FINE_LOCATION,
        )
        val coarse = ContextCompat.checkSelfPermission(
            this, Manifest.permission.ACCESS_COARSE_LOCATION,
        )
        if (fine == PackageManager.PERMISSION_GRANTED || coarse == PackageManager.PERMISSION_GRANTED) {
            type = type or ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION
        }
        return type
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onDestroy() {
        teardownSession()
        releaseWakeLock()
        super.onDestroy()
    }

    private fun startBleSession(address: String) {
        if (session != null) {
            Log.i(TAG, "BLE session already active — ignore reconnect request")
            return
        }
        RadiacodeNotificationPlugin.emitConnectionState("reconnecting")
        val listener = object : SessionListener {
            override fun onConnected() {
                deviceReady = false
                Log.i(TAG, "GATT connected — running handshake")
                runHandshake()
            }

            override fun onDisconnected() {
                deviceReady = false
                stopPollLoop()
                RadiacodeNotificationPlugin.emitConnectionState("disconnected")
            }

            override fun onReconnecting() {
                RadiacodeNotificationPlugin.emitConnectionState("reconnecting")
            }

            override fun onNotification(bytes: ByteArray) {
                // Alle Notifications gehen 1:1 an den TS-Client (für
                // Spektrum/Settings-Antworten). Parallel füttert der
                // native Reassembler seine Poll-Antwort.
                RadiacodeNotificationPlugin.emitNotification(bytes)
                val complete = reassembler.push(bytes) ?: return
                val parsed = parseResponse(complete) ?: return
                if (parsed.cmd == Protocol.Command.RD_VIRT_STRING && parsed.seq == pollSeq) {
                    val m = MeasurementDecoder.parse(parsed.data)
                    if (m != null) RadiacodeNotificationPlugin.emitMeasurement(m)
                }
            }
        }
        val s = GattSession(applicationContext, address, listener)
        session = s
        s.connect()
    }

    private fun runHandshake() {
        // SET_EXCHANGE: args [0x01, 0xff, 0x12, 0xff] (analog TS-Client).
        writeCommand(
            Protocol.Command.SET_EXCHANGE,
            byteArrayOf(0x01, 0xff.toByte(), 0x12, 0xff.toByte()),
        )
        writeCommand(Protocol.Command.SET_TIME, encodeSetTime(Date()))
        // WR_VIRT_SFR(DEVICE_TIME=0): <id_u32_le><value_u32_le>.
        val args = java.nio.ByteBuffer
            .allocate(8)
            .order(java.nio.ByteOrder.LITTLE_ENDIAN)
            .putInt(Protocol.Vsfr.DEVICE_TIME)
            .putInt(0)
            .array()
        writeCommand(Protocol.Command.WR_VIRT_SFR, args)

        deviceReady = true
        RadiacodeNotificationPlugin.emitConnectionState("connected")
        startPollLoop()
    }

    private fun writeCommand(cmd: Int, args: ByteArray): Int {
        val seq = seqIndex.getAndIncrement() % Protocol.SEQ_MODULO
        val frame = Framing.buildRequest(cmd, seq, args)
        session?.sendWrite(frame)
        return seq
    }

    private fun startPollLoop() {
        stopPollLoop()
        val exec = Executors.newSingleThreadScheduledExecutor()
        pollExecutor = exec
        pollTask = exec.scheduleAtFixedRate({
            try {
                if (!deviceReady) return@scheduleAtFixedRate
                pollSeq = writeCommand(
                    Protocol.Command.RD_VIRT_STRING,
                    Framing.u32le(Protocol.Vs.DATA_BUF),
                )
            } catch (t: Throwable) {
                Log.w(TAG, "Poll tick failed", t)
            }
        }, POLL_INTERVAL_MS, POLL_INTERVAL_MS, TimeUnit.MILLISECONDS)
    }

    private fun stopPollLoop() {
        pollTask?.cancel(false)
        pollTask = null
        pollExecutor?.shutdown()
        pollExecutor = null
    }

    private fun teardownSession() {
        stopPollLoop()
        session?.release()
        session = null
        deviceReady = false
    }

    private fun encodeSetTime(d: Date): ByteArray {
        val cal = java.util.Calendar.getInstance().apply { time = d }
        return byteArrayOf(
            cal.get(java.util.Calendar.DAY_OF_MONTH).toByte(),
            (cal.get(java.util.Calendar.MONTH) + 1).toByte(),
            (cal.get(java.util.Calendar.YEAR) - 2000).toByte(),
            0,
            cal.get(java.util.Calendar.SECOND).toByte(),
            cal.get(java.util.Calendar.MINUTE).toByte(),
            cal.get(java.util.Calendar.HOUR_OF_DAY).toByte(),
            0,
        )
    }

    private fun acquireWakeLock() {
        if (wakeLock?.isHeld == true) return
        val pm = getSystemService(Context.POWER_SERVICE) as? PowerManager ?: return
        wakeLock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, WAKE_LOCK_TAG).apply {
            setReferenceCounted(false)
            acquire()
        }
    }

    private fun releaseWakeLock() {
        wakeLock?.let { if (it.isHeld) it.release() }
        wakeLock = null
    }

    private fun buildNotification(title: String, body: String): Notification {
        val tapIntent = Intent(this, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP
        }
        val tapPending = PendingIntent.getActivity(
            this, 0, tapIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
        val disconnectIntent = Intent(this, RadiacodeForegroundService::class.java).apply {
            action = ACTION_DISCONNECT_REQUESTED
        }
        val disconnectPending = PendingIntent.getService(
            this, 1, disconnectIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_launcher_foreground)
            .setContentTitle(title)
            .setContentText(body)
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .setContentIntent(tapPending)
            .addAction(
                0,
                getString(R.string.radiacode_notification_action_disconnect),
                disconnectPending,
            )
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setCategory(NotificationCompat.CATEGORY_SERVICE)
            .build()
    }

    private fun ensureChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        val nm = getSystemService(NOTIFICATION_SERVICE) as? NotificationManager ?: return
        if (nm.getNotificationChannel(CHANNEL_ID) != null) return
        val channel = NotificationChannel(
            CHANNEL_ID,
            getString(R.string.radiacode_notification_channel_name),
            NotificationManager.IMPORTANCE_LOW,
        )
        channel.description = getString(R.string.radiacode_notification_channel_desc)
        channel.setShowBadge(false)
        nm.createNotificationChannel(channel)
    }
}
