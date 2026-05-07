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
import android.os.Looper
import android.os.PowerManager
import android.util.Log
import androidx.core.app.NotificationCompat
import androidx.core.app.ServiceCompat
import androidx.core.content.ContextCompat
import com.google.android.gms.location.FusedLocationProviderClient
import com.google.android.gms.location.LocationCallback
import com.google.android.gms.location.LocationRequest
import com.google.android.gms.location.LocationResult
import com.google.android.gms.location.LocationServices
import com.google.android.gms.location.Priority
import at.ffnd.einsatzkarte.gpstrack.FirestoreLineUpdater
import at.ffnd.einsatzkarte.gpstrack.GpsTrackConfig
import at.ffnd.einsatzkarte.gpstrack.GpsTrackRecorder
import at.ffnd.einsatzkarte.gpstrack.LineUpdater
import at.ffnd.einsatzkarte.livelocation.FirestoreLiveLocationDocWriter
import at.ffnd.einsatzkarte.livelocation.LiveLocationConfig
import at.ffnd.einsatzkarte.livelocation.LiveLocationPusher
import at.ffnd.einsatzkarte.radiacode.Measurement
import at.ffnd.einsatzkarte.radiacode.MeasurementMapper
import at.ffnd.einsatzkarte.radiacode.RadiaCode
import at.ffnd.einsatzkarte.radiacode.RadiaCodeException
import at.ffnd.einsatzkarte.radiacode.transport.BluetoothTransport
import at.ffnd.einsatzkarte.radiacode.transport.ConnectionClosed
import at.ffnd.einsatzkarte.radiacode.transport.DeviceNotFound
import at.ffnd.einsatzkarte.radiacode.transport.TransportTimeout
import at.ffnd.einsatzkarte.radiacode.track.FirestoreMarkerWriter
import at.ffnd.einsatzkarte.radiacode.track.LatLng
import at.ffnd.einsatzkarte.radiacode.track.SampleRate
import at.ffnd.einsatzkarte.radiacode.track.TrackConfig
import at.ffnd.einsatzkarte.radiacode.track.TrackRecorder
import java.util.concurrent.Executors
import java.util.concurrent.ExecutorService
import java.util.concurrent.ScheduledExecutorService
import java.util.concurrent.ScheduledFuture
import java.util.concurrent.TimeUnit

/**
 * Foreground-Service + nativer Radiacode-BLE-Owner. Läuft solange mindestens
 * ein Client verbunden ist und hält CPU/Notification am Leben (siehe Phase 1).
 *
 * Neu gegenüber Phase 1: Wenn ACTION_BLE_CONNECT reinkommt, übernimmt der
 * Service exklusiv die BLE-Session ([BluetoothTransport]+[RadiaCode]) und
 * pollt DATA_BUF im nativen Code. Measurements gehen per Plugin-Event an
 * den WebView. Direct-Execute-Calls ([executeRawRequest]) erlauben dem
 * TS-Client weiterhin Spektrum/Settings-Zugriff über denselben GATT-Kanal.
 */
class RadiacodeForegroundService : Service() {

    companion object {
        private var instance: RadiacodeForegroundService? = null
        fun getInstance(): RadiacodeForegroundService? = instance

        const val CHANNEL_ID = "radiacode_connection"
        const val NOTIFICATION_ID = 4711
        const val WAKE_LOCK_TAG = "einsatzkarte:radiacode"

        const val ACTION_START = "at.ffnd.einsatzkarte.RADIACODE_START"
        const val ACTION_UPDATE = "at.ffnd.einsatzkarte.RADIACODE_UPDATE"
        const val ACTION_STOP = "at.ffnd.einsatzkarte.RADIACODE_STOP"
        const val ACTION_DISCONNECT_REQUESTED = "at.ffnd.einsatzkarte.RADIACODE_DISCONNECT_REQUESTED"
        const val ACTION_BLE_CONNECT = "at.ffnd.einsatzkarte.RADIACODE_BLE_CONNECT"
        const val ACTION_BLE_DISCONNECT = "at.ffnd.einsatzkarte.RADIACODE_BLE_DISCONNECT"
        const val ACTION_START_TRACK = "at.ffnd.einsatzkarte.RADIACODE_START_TRACK"
        const val ACTION_STOP_TRACK = "at.ffnd.einsatzkarte.RADIACODE_STOP_TRACK"
        const val ACTION_START_GPS_TRACK = "at.ffnd.einsatzkarte.GPS_TRACK_START"
        const val ACTION_STOP_GPS_TRACK = "at.ffnd.einsatzkarte.GPS_TRACK_STOP"
        const val ACTION_START_LIVE_SHARE  = "at.ffnd.einsatzkarte.LIVE_SHARE_START"
        const val ACTION_STOP_LIVE_SHARE   = "at.ffnd.einsatzkarte.LIVE_SHARE_STOP"
        const val ACTION_UPDATE_LIVE_SHARE = "at.ffnd.einsatzkarte.LIVE_SHARE_UPDATE"

        const val EXTRA_TITLE = "title"
        const val EXTRA_BODY = "body"
        const val EXTRA_DEVICE_ADDRESS = "deviceAddress"
        const val EXTRA_FIRECALL_ID = "firecallId"
        const val EXTRA_LAYER_ID = "layerId"
        const val EXTRA_SAMPLE_RATE = "sampleRate"
        const val EXTRA_DEVICE_LABEL = "deviceLabel"
        const val EXTRA_CREATOR = "creator"
        const val EXTRA_FIRESTORE_DB = "firestoreDb"
        const val EXTRA_LINE_ID = "lineId"
        const val EXTRA_SAMPLE_RATE_KIND = "sampleRateKind"
        const val EXTRA_CUSTOM_INTERVAL = "customIntervalSec"
        const val EXTRA_CUSTOM_DISTANCE = "customDistanceM"
        const val EXTRA_CUSTOM_DOSE_DELTA = "customDoseRateDeltaUSvH"
        const val EXTRA_INITIAL_LAT = "initialLat"
        const val EXTRA_INITIAL_LNG = "initialLng"
        const val EXTRA_LIVE_UID = "liveUid"
        const val EXTRA_LIVE_NAME = "liveName"
        const val EXTRA_LIVE_EMAIL = "liveEmail"
        const val EXTRA_LIVE_INTERVAL_MS = "liveIntervalMs"
        const val EXTRA_LIVE_DISTANCE_M = "liveDistanceM"
        const val EXTRA_LIVE_FIRECALL_NAME = "liveFirecallName"

        private const val TAG = "RadiacodeFg"
        // 2 s Poll-Takt — angeglichen an radiacode-python `basic.py`. Bei 1 s
        // sehen wir nach dem ersten Read keine weiteren `gid=3 RareData`-Records
        // (Dose/Akku/Temperatur) mehr. Vermutung: Geräte-FIFO oder interner
        // Producer-Tick wird durch zu schnelles Lesen lahmgelegt. Die mobile
        // Referenz-App reagiert in ~10 s, 2 s ist konservativer und bewiesen
        // (radiacode-py läuft so).
        private const val POLL_INTERVAL_MS = 2000L

        // Nach so vielen aufeinanderfolgenden Timeouts wird die Session als
        // tot betrachtet und ein Reconnect-Versuch gestartet. Bei 2.5 s
        // poll-Timeout ist das = ca. 5 s Erkennungszeit.
        private const val MAX_CONSECUTIVE_TIMEOUTS = 2

        // Per-Tick Timeout für `radiaCode.dataBuf()`. Deutlich kürzer als der
        // 10s-Default des BluetoothTransport, damit ein halb-toter BLE-Link
        // (Standby-Drop ohne Android-STATE_DISCONNECTED) schnell erkannt wird.
        // Ein normaler DATA_BUF-Read schließt in deutlich unter 1 s ab — 2.5 s
        // sind großzügig genug, dass kurze Connection-Interval-Schwankungen
        // keinen falschen Timeout auslösen.
        private const val POLL_TIMEOUT_MS = 2_500L

        // Backoff zwischen Reconnect-Versuchen. Erste paar Versuche schnell
        // (typisches Standby-Wedge erholt sich nach kurzer Pause), dann
        // länger werdend bis 30 s, danach Cap. Reconnect läuft persistent —
        // nur ACTION_BLE_DISCONNECT (User) oder ein Service-Tod stoppt ihn.
        private val RECONNECT_BACKOFF_MS = longArrayOf(1_500L, 5_000L, 15_000L, 30_000L)

        // Wenn nach so vielen Millisekunden seit Session-Start kein Rare-Record
        // (Dose/Akku/Temperatur) gekommen ist, einmaligen Force-Reconnect mit
        // frischem GATT triggern. 30 s ist konservativ — auf einem
        // bereits-eingeschalteten Gerät kommen Rare-Records typisch innerhalb
        // weniger Sekunden, sodass dieses Timeout ausschließlich den
        // "Gerät-erst-nach-Connect-eingeschaltet"-Fall trifft.
        private const val RARE_BOOTSTRAP_TIMEOUT_MS = 30_000L

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

    private var transport: BluetoothTransport? = null
    private var radiaCode: RadiaCode? = null
    @Volatile private var currentAddress: String? = null
    @Volatile private var deviceReady = false

    /** Single-thread worker für blockierende BLE-Calls (Connect-Handshake + execute). */
    private var bleWorker: ExecutorService? = null

    private var pollExecutor: ScheduledExecutorService? = null
    private var pollTask: ScheduledFuture<*>? = null

    // Aufeinanderfolgende `TransportTimeout` im Polling — Indikator für eine
    // halb-tote BLE-Session (Gerät hat im Standby den Link gedroppt, Android
    // sieht den Disconnect aber noch nicht). Nach zwei in Folge wird die
    // Session forciert geschlossen + ein Reconnect angestoßen, sonst hängt
    // der Service ewig in 10-Sekunden-Timeout-Loops.
    @Volatile private var consecutiveTimeouts: Int = 0

    // Counter für Reconnect-Versuche; bestimmt das Backoff-Delay. Wird
    // bei erfolgreichem Tick UND bei erfolgreichem Reconnect-Handshake
    // auf 0 zurückgesetzt.
    @Volatile private var reconnectAttempt: Int = 0

    // Bootstrap-State für `gid=3 RareData` (Akku/Dose/Temperatur). Beobachtung:
    // Wenn das Gerät beim Connect AUS war und erst danach eingeschaltet wird,
    // liefert die bestehende GATT-Verbindung NIE Rare-Records — auch wenn
    // Realtime-Records munter fließen. Der einzige bekannte Workaround ist
    // ein **frischer GATT-Reconnect** (User klickt manuell trennen+verbinden).
    // Wir reproduzieren das automatisch: wenn nach `RARE_BOOTSTRAP_TIMEOUT_MS`
    // kein Rare-Record gesehen wurde, einmaliger Force-Reconnect. Wenn auch
    // der nichts bringt, geben wir auf — ein Loop wäre schlimmer als kein
    // Akku-Wert. Reset des `rareBootstrapAttempted`-Flags geschieht nur bei
    // User-Disconnect (`teardownSession`), damit ein erneutes Manual-Connect
    // wieder einen Bootstrap-Versuch erlaubt.
    @Volatile private var sessionReadyMs: Long = 0L
    @Volatile private var rareSeenThisSession: Boolean = false
    @Volatile private var rareBootstrapAttempted: Boolean = false

    private var fusedLocation: FusedLocationProviderClient? = null
    private var locationCallback: LocationCallback? = null
    @Volatile private var locationActive = false
    @Volatile private var lastLocation: android.location.Location? = null
    @Volatile private var trackRecorder: TrackRecorder? = null
    @Volatile private var gpsTrackRecorder: GpsTrackRecorder? = null
    @Volatile private var liveLocationPusher: LiveLocationPusher? = null
    @Volatile private var liveShareFirecallName: String = ""

    // Letzte gesehene Rare-Felder für Late-Connect / leere Ticks. Werden in
    // `onMeasurementReceived` aktualisiert und bei `teardownSession` gelöscht,
    // damit kein veralteter Wert in eine neue Session eingespielt wird.
    @Volatile private var cachedDoseUSv: Double? = null
    @Volatile private var cachedDurationSec: Int? = null
    @Volatile private var cachedTemperatureC: Double? = null
    @Volatile private var cachedChargePct: Double? = null

    fun isBleConnected(): Boolean = deviceReady
    fun getDeviceAddress(): String? = currentAddress
    fun isRadiacodeTracking(): Boolean = trackRecorder != null
    fun isGpsTracking(): Boolean = gpsTrackRecorder != null
    fun isLiveShareActive(): Boolean = liveLocationPusher != null

    /**
     * Synchroner Wire-Level-Execute für den TS-Plugin-Pfad. Schreibt einen
     * komplett geframten Request (mit `<I>`-Längen-Prefix) über den
     * gehaltenen [BluetoothTransport] und gibt die wieder zusammengesetzte
     * Response-Body (ohne Prefix) zurück. Wird aus
     * [RadiacodeNotificationPlugin.executeNative] aufgerufen — darf NICHT
     * vom Main/UI-Thread laufen, weil [BluetoothTransport.execute]
     * blockiert bis zur Antwort oder zum Timeout.
     *
     * @throws IllegalStateException wenn keine BLE-Session aktiv ist
     * @throws ConnectionClosed wenn die Verbindung während der Anfrage abreißt
     * @throws TransportTimeout wenn das Gerät nicht innerhalb des Default-Timeouts antwortet
     */
    @Throws(ConnectionClosed::class, TransportTimeout::class)
    fun executeRawRequest(framedRequest: ByteArray): ByteArray {
        val t = transport ?: throw IllegalStateException("No active BLE session")
        val response = t.execute(framedRequest)
        return response.remaining()
    }

    fun getCachedDoseUSv(): Double? = cachedDoseUSv
    fun getCachedDurationSec(): Int? = cachedDurationSec
    fun getCachedTemperatureC(): Double? = cachedTemperatureC
    fun getCachedChargePct(): Double? = cachedChargePct

    override fun onCreate() {
        super.onCreate()
        instance = this
        Log.i(TAG, "onCreate pid=${android.os.Process.myPid()}")
        ensureChannel()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        val action = intent?.action
        val isHotPath = action == ACTION_UPDATE
        val logMsg = "onStartCommand action=$action startId=$startId flags=$flags " +
            "session=${if (radiaCode != null) "active" else "none"} deviceReady=$deviceReady"
        if (isHotPath) Log.d(TAG, logMsg) else Log.i(TAG, logMsg)
        // Jede Action promoviert den Service in den Foreground-Status. Wurde er
        // via startForegroundService() gestartet, muss startForeground() sowieso
        // innerhalb von 10 s folgen; bei startService() (z.B. ACTION_UPDATE auf
        // laufendem Service) ist der Call idempotent und aktualisiert nur die
        // Notification. Entscheidend: Ab Android 14 (API 34+) MUSS die 3-arg-
        // Variante mit Service-Typ aufgerufen werden, sonst crasht der Service
        // mit MissingForegroundServiceTypeException — und reisst unsere
        // BLE-Session mit sich. Siehe Bug-Report vom 2026-04-22.
        if (action != null && action != ACTION_STOP && action != ACTION_DISCONNECT_REQUESTED) {
            ensureForeground()
        }

        when (action) {
            ACTION_START -> {
                acquireWakeLock()
            }
            ACTION_UPDATE -> {
                // Already updated titles and called ensureForeground()
            }
            ACTION_STOP -> {
                // ACTION_STOP darf NICHT die BLE-Session abbrechen. TS-Cleanup
                // (z.B. React-Effekt-Reconciliation beim Status-Flip
                // connected→connecting→connected) ruft stopForegroundService()
                // auf, ohne dass der User wirklich disconnecten will. Wenn wir
                // hier stopSelf() rufen, killt Android den gesamten Service
                // inklusive GATT-Session — siehe Bug-Analyse 2026-04-22.
                // Session-Teardown ausschliesslich via ACTION_BLE_DISCONNECT.
                if (radiaCode != null || gpsTrackRecorder != null || liveLocationPusher != null) {
                    Log.w(TAG, "ACTION_STOP ignoriert — Session/GPS-Track/Live-Share aktiv, Service bleibt laufen")
                } else {
                    Log.i(TAG, "ACTION_STOP — keine Session, Service wird beendet")
                    releaseWakeLock()
                    stopForeground(STOP_FOREGROUND_REMOVE)
                    stopSelf()
                }
            }
            ACTION_DISCONNECT_REQUESTED -> {
                RadiacodeNotificationPlugin.onDisconnectRequested()
            }
            ACTION_BLE_CONNECT -> {
                val address = intent?.getStringExtra(EXTRA_DEVICE_ADDRESS)
                if (address.isNullOrBlank()) {
                    Log.w(TAG, "ACTION_BLE_CONNECT without deviceAddress")
                } else {
                    acquireWakeLock()
                    startBleSession(address)
                }
            }
            ACTION_BLE_DISCONNECT -> {
                teardownSession()
                if (gpsTrackRecorder == null && liveLocationPusher == null) {
                    Log.i(TAG, "ACTION_BLE_DISCONNECT — no GPS track / live-share, stopping service")
                    stopHighAccuracyLocation()
                    releaseWakeLock()
                    stopForeground(STOP_FOREGROUND_REMOVE)
                    stopSelf()
                } else {
                    updateNotificationForState()
                }
            }
            ACTION_START_TRACK -> {
                val firecallId = intent?.getStringExtra(EXTRA_FIRECALL_ID)
                val layerId = intent?.getStringExtra(EXTRA_LAYER_ID)
                val rateStr = intent?.getStringExtra(EXTRA_SAMPLE_RATE)
                val kindStr = intent?.getStringExtra(EXTRA_SAMPLE_RATE_KIND)
                val deviceLabel = intent?.getStringExtra(EXTRA_DEVICE_LABEL) ?: ""
                val creator = intent?.getStringExtra(EXTRA_CREATOR) ?: ""
                val firestoreDb = intent?.getStringExtra(EXTRA_FIRESTORE_DB) ?: ""
                if (firecallId.isNullOrBlank() || layerId.isNullOrBlank() ||
                    (rateStr.isNullOrBlank() && kindStr.isNullOrBlank())
                ) {
                    Log.w(TAG, "ACTION_START_TRACK rejected — missing required extras")
                } else {
                    val parsedRate: SampleRate = if (kindStr != null) parseSampleRate(intent!!)
                        else SampleRate.fromString(rateStr!!)
                    val config = TrackConfig(
                        firecallId = firecallId, layerId = layerId,
                        sampleRate = parsedRate,
                        deviceLabel = deviceLabel, creator = creator,
                        firestoreDb = firestoreDb,
                    )
                    trackRecorder?.stop()
                    trackRecorder = TrackRecorder(
                        config = config,
                        writer = FirestoreMarkerWriter(firestoreDb),
                        onWriteSuccess = { r ->
                            RadiacodeNotificationPlugin.emitMarkerWritten(
                                r.docId, r.layerId, r.lat, r.lng,
                                r.timestampMs, r.dosisleistungUSvH, r.cps,
                            )
                        },
                    )
                    Log.i(TAG, "ACTION_START_TRACK firecallId=$firecallId layerId=$layerId rate=$parsedRate")
                }
            }
            ACTION_STOP_TRACK -> {
                Log.i(TAG, "ACTION_STOP_TRACK")
                trackRecorder?.stop()
                trackRecorder = null
            }
            ACTION_START_GPS_TRACK -> {
                val firecallId = intent?.getStringExtra(EXTRA_FIRECALL_ID)
                val lineId     = intent?.getStringExtra(EXTRA_LINE_ID)
                val firestoreDb = intent?.getStringExtra(EXTRA_FIRESTORE_DB) ?: ""
                val creator     = intent?.getStringExtra(EXTRA_CREATOR) ?: ""
                if (firecallId.isNullOrBlank() || lineId.isNullOrBlank()) {
                    Log.w(TAG, "ACTION_START_GPS_TRACK rejected — missing extras")
                } else {
                    val rate = parseSampleRate(intent!!)
                    val cfg = GpsTrackConfig(
                        firecallId = firecallId, lineId = lineId,
                        sampleRate = rate, firestoreDb = firestoreDb, creator = creator,
                    )
                    gpsTrackRecorder?.stop()
                    val fsUpdater = FirestoreLineUpdater(firestoreDb)
                    gpsTrackRecorder = GpsTrackRecorder(cfg, fsUpdater)
                    acquireWakeLock()
                    startHighAccuracyLocation()
                    val initLat = if (intent?.hasExtra(EXTRA_INITIAL_LAT) == true) intent.getDoubleExtra(EXTRA_INITIAL_LAT, Double.NaN) else Double.NaN
                    val initLng = if (intent?.hasExtra(EXTRA_INITIAL_LNG) == true) intent.getDoubleExtra(EXTRA_INITIAL_LNG, Double.NaN) else Double.NaN
                    if (!initLat.isNaN() && !initLng.isNaN()) {
                        gpsTrackRecorder?.onLocation(initLat, initLng)
                    }
                    updateNotificationForState()
                    Log.i(TAG, "GPS track started firecall=$firecallId line=$lineId rate=$rate")
                }
            }
            ACTION_STOP_GPS_TRACK -> {
                Log.i(TAG, "GPS track stop")
                gpsTrackRecorder?.stop()
                gpsTrackRecorder = null
                if (radiaCode == null && liveLocationPusher == null) {
                    stopHighAccuracyLocation()
                    releaseWakeLock()
                    stopForeground(STOP_FOREGROUND_REMOVE)
                    stopSelf()
                } else {
                    updateNotificationForState()
                }
            }
            ACTION_START_LIVE_SHARE -> {
                val firecallId = intent?.getStringExtra(EXTRA_FIRECALL_ID)
                val uid        = intent?.getStringExtra(EXTRA_LIVE_UID)
                val nm         = intent?.getStringExtra(EXTRA_LIVE_NAME) ?: ""
                val email      = intent?.getStringExtra(EXTRA_LIVE_EMAIL) ?: ""
                val intervalMs = intent?.getLongExtra(EXTRA_LIVE_INTERVAL_MS, 5_000L) ?: 5_000L
                val distanceM  = intent?.getDoubleExtra(EXTRA_LIVE_DISTANCE_M, 25.0) ?: 25.0
                val firecallNm = intent?.getStringExtra(EXTRA_LIVE_FIRECALL_NAME) ?: ""
                val firestoreDb = intent?.getStringExtra(EXTRA_FIRESTORE_DB) ?: ""
                if (firecallId.isNullOrBlank() || uid.isNullOrBlank()) {
                    Log.w(TAG, "ACTION_START_LIVE_SHARE rejected — missing firecallId/uid")
                } else {
                    val cfg = LiveLocationConfig(
                        firecallId = firecallId, uid = uid, name = nm, email = email,
                    )
                    // Existierenden Pusher (anderer Firecall/UID) sauber abdrehen.
                    liveLocationPusher?.let { prev ->
                        prev.stop()
                        prev.deleteDoc()
                    }
                    val sink = FirestoreLiveLocationDocWriter(firestoreDb)
                    val pusher = LiveLocationPusher(cfg, sink, intervalMs, distanceM)
                    liveLocationPusher = pusher
                    liveShareFirecallName = firecallNm
                    acquireWakeLock()
                    startHighAccuracyLocation()
                    // Wenn schon ein Fix vorliegt, sofort einen ersten Sample
                    // schreiben — analog zu ACTION_START_GPS_TRACK.
                    lastLocation?.let { loc ->
                        pusher.onLocation(
                            loc.latitude, loc.longitude,
                            accuracy = loc.accuracy.toDouble().takeIf { loc.hasAccuracy() },
                            heading  = loc.bearing.toDouble().takeIf { loc.hasBearing() },
                            speed    = loc.speed.toDouble().takeIf { loc.hasSpeed() },
                        )
                    }
                    updateNotificationForState()
                    Log.i(
                        TAG,
                        "live-share started firecall=$firecallId uid=$uid intervalMs=$intervalMs distanceM=$distanceM",
                    )
                }
            }
            ACTION_STOP_LIVE_SHARE -> {
                Log.i(TAG, "live-share stop")
                liveLocationPusher?.let { p ->
                    p.stop()
                    // Best-effort delete — der Service darf darauf nicht warten,
                    // sondern teardown'd asynchron. Wenn der Service direkt
                    // danach beendet wird, holt die Firestore-TTL (~1 h) den
                    // Doc-Cleanup nach.
                    p.deleteDoc()
                }
                liveLocationPusher = null
                liveShareFirecallName = ""
                if (radiaCode == null && gpsTrackRecorder == null) {
                    stopHighAccuracyLocation()
                    releaseWakeLock()
                    stopForeground(STOP_FOREGROUND_REMOVE)
                    stopSelf()
                } else {
                    updateNotificationForState()
                }
            }
            ACTION_UPDATE_LIVE_SHARE -> {
                val intervalMs = intent?.getLongExtra(EXTRA_LIVE_INTERVAL_MS, -1L) ?: -1L
                val distanceM  = intent?.getDoubleExtra(EXTRA_LIVE_DISTANCE_M, -1.0) ?: -1.0
                val pusher = liveLocationPusher
                if (pusher == null) {
                    Log.i(TAG, "ACTION_UPDATE_LIVE_SHARE ignored — pusher not running")
                } else if (intervalMs <= 0L || distanceM < 0.0) {
                    Log.w(TAG, "ACTION_UPDATE_LIVE_SHARE rejected — invalid intervalMs=$intervalMs distanceM=$distanceM")
                } else {
                    pusher.updateSettings(intervalMs, distanceM)
                    Log.i(TAG, "live-share settings updated intervalMs=$intervalMs distanceM=$distanceM")
                }
            }
        }
        return START_NOT_STICKY
    }

    private var lastForegroundType: Int = 0

    private fun ensureForeground() {
        val notif = buildNotification(lastTitle, lastBody)
        val type = resolveForegroundServiceType()
        if (type != lastForegroundType) {
            Log.i(TAG, "ensureForeground type=0x${type.toString(16)} (was 0x${lastForegroundType.toString(16)})")
            lastForegroundType = type
        }
        try {
            ServiceCompat.startForeground(this, NOTIFICATION_ID, notif, type)
        } catch (t: Throwable) {
            Log.e(TAG, "startForeground FAILED type=0x${type.toString(16)}", t)
            throw t
        }
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
        Log.i(
            TAG,
            "onDestroy — session=${if (radiaCode != null) "active" else "none"} " +
                "deviceReady=$deviceReady",
        )
        if (instance == this) instance = null
        teardownSession()
        trackRecorder?.stop()
        trackRecorder = null
        gpsTrackRecorder?.stop()
        gpsTrackRecorder = null
        liveLocationPusher?.let { p ->
            p.stop()
            p.deleteDoc()
        }
        liveLocationPusher = null
        liveShareFirecallName = ""
        stopHighAccuracyLocation()
        releaseWakeLock()
        bleWorker?.shutdown()
        bleWorker = null
        stopForeground(STOP_FOREGROUND_REMOVE)
        super.onDestroy()
    }

    override fun onTaskRemoved(rootIntent: Intent?) {
        Log.w(TAG, "onTaskRemoved — app swiped away. Stopping all services.")

        gpsTrackRecorder?.stop()
        gpsTrackRecorder = null

        liveLocationPusher?.let { p ->
            p.stop()
            p.deleteDoc()
        }
        liveLocationPusher = null
        liveShareFirecallName = ""

        teardownSession()

        stopHighAccuracyLocation()
        releaseWakeLock()
        stopForeground(STOP_FOREGROUND_REMOVE)
        stopSelf()

        super.onTaskRemoved(rootIntent)
    }

    override fun onLowMemory() {
        Log.w(TAG, "onLowMemory")
        super.onLowMemory()
    }

    override fun onTrimMemory(level: Int) {
        Log.w(TAG, "onTrimMemory level=$level")
        super.onTrimMemory(level)
    }

    private fun onMeasurementReceived(m: Measurement) {
        // Diagnose-Log für Rare-Felder: dose/charge/temperature/duration
        // sollten regelmäßig (alle paar Sekunden) Werte != null haben. Wenn
        // sie dauerhaft null bleiben, liefert das Gerät keine Rare-Records
        // aus, obwohl die Verbindung steht — siehe Bug-Analyse 2026-04-26.
        Log.d(
            TAG,
            "measurement dl=${"%.3f".format(java.util.Locale.ROOT, m.dosisleistungUSvH)} µSv/h " +
                "cps=${"%.3f".format(java.util.Locale.ROOT, m.cps)} " +
                "dlErr=${m.dosisleistungErrPct} cpsErr=${m.cpsErrPct} " +
                "dose=${m.doseUSv} chg=${m.chargePct} temp=${m.temperatureC} dur=${m.durationSec}",
        )
        // Rare-Felder cachen, damit das Plugin sie auch in Ticks ohne
        // frischen Rare-Record an die UI weiterreichen kann.
        m.doseUSv?.let { cachedDoseUSv = it }
        m.durationSec?.let { cachedDurationSec = it }
        m.temperatureC?.let { cachedTemperatureC = it }
        m.chargePct?.let { cachedChargePct = it }

        RadiacodeNotificationPlugin.emitMeasurement(m)
        trackRecorder?.onMeasurement(
            m,
            lastLocation?.let { LatLng(it.latitude, it.longitude) },
        )
        updateNotificationWithMeasurement(m)
    }

    private fun updateNotificationWithMeasurement(m: Measurement) {
        val dose = m.dosisleistungUSvH
        val cps = m.cps
        val doseErr = m.dosisleistungErrPct ?: -1.0
        val cpsErr = m.cpsErrPct ?: -1.0

        lastBody = formatBody(dose, cps, doseErr, cpsErr, deviceReady)
        ensureForeground()
    }

    private fun formatBody(dose: Double, cps: Double, doseErr: Double, cpsErr: Double, connected: Boolean): String {
        var body = String.format(java.util.Locale.GERMAN, "%.2f µSv/h %.1f imp/s", dose, cps)
        if (doseErr >= 0) {
            body += String.format(java.util.Locale.GERMAN, " ± %.0f%%", doseErr)
        }
        if (!connected) return body + " (letzter Wert)"
        return body
    }


    private fun startBleSession(address: String) {
        val active = radiaCode
        if (active != null && currentAddress == address) {
            Log.i(TAG, "BLE session already active for $address — re-emitting state")
            if (deviceReady) {
                RadiacodeNotificationPlugin.emitConnectionState("connected")
                startPollLoop()
            } else {
                RadiacodeNotificationPlugin.emitConnectionState("reconnecting")
            }
            return
        }
        if (active != null) {
            Log.i(TAG, "New address $address different from active session — tearing down old session")
            teardownSession()
        }
        Log.i(TAG, "startBleSession address=$address")
        currentAddress = address
        RadiacodeNotificationPlugin.emitConnectionState("reconnecting")
        updateNotificationForState()
        startHighAccuracyLocation()

        val worker = bleWorker ?: Executors.newSingleThreadExecutor { r ->
            Thread(r, "RadiacodeBleWorker")
        }.also { bleWorker = it }
        worker.execute {
            try {
                // BluetoothTransport-Konstruktor blockiert bis CCCD-Subscription steht.
                // RadiaCode-Konstruktor blockiert bis Init-Handshake durch ist
                // (SET_EXCHANGE → SET_TIME → DEVICE_TIME=0 → GET_VERSION → CONFIGURATION).
                val t = BluetoothTransport(applicationContext, address)
                val rc = RadiaCode(t, ignoreFirmwareCompatibilityCheck = false)
                if (currentAddress != address) {
                    // Session-Wechsel während des Aufbaus → frisch geöffneten Transport gleich wieder schließen.
                    Log.w(TAG, "startBleSession aborted — currentAddress changed during init")
                    rc.close()
                    return@execute
                }
                transport = t
                radiaCode = rc
                deviceReady = true
                consecutiveTimeouts = 0
                reconnectAttempt = 0
                sessionReadyMs = System.currentTimeMillis()
                rareSeenThisSession = false
                // `rareBootstrapAttempted` bleibt across reconnects gesetzt,
                // damit wir nach einem fehlgeschlagenen Bootstrap nicht in
                // eine Endlos-Schleife laufen. Reset nur in `teardownSession`.
                RadiacodeNotificationPlugin.emitConnectionState("connected")
                updateNotificationForState()
                startPollLoop()
            } catch (e: DeviceNotFound) {
                Log.w(TAG, "startBleSession — device not found / connect failed", e)
                handleConnectionLost()
                scheduleReconnect("DeviceNotFound: ${e.message}")
            } catch (e: ConnectionClosed) {
                Log.w(TAG, "startBleSession — connection closed during init", e)
                handleConnectionLost()
                scheduleReconnect("ConnectionClosed during init")
            } catch (e: TransportTimeout) {
                Log.w(TAG, "startBleSession — handshake timed out", e)
                handleConnectionLost()
                scheduleReconnect("TransportTimeout during init")
            } catch (e: RadiaCodeException) {
                Log.w(TAG, "startBleSession — protocol error", e)
                handleConnectionLost()
                scheduleReconnect("RadiaCodeException: ${e.message}")
            } catch (t: Throwable) {
                Log.e(TAG, "startBleSession — unexpected error", t)
                handleConnectionLost()
                scheduleReconnect("unexpected error: ${t.message}")
            }
        }
    }

    private fun handleConnectionLost() {
        deviceReady = false
        stopPollLoop()
        try { radiaCode?.close() } catch (_: Throwable) { /* best effort */ }
        radiaCode = null
        transport = null
        RadiacodeNotificationPlugin.emitConnectionState("disconnected")
        updateNotificationForState()
    }

    private fun startPollLoop() {
        stopPollLoop()
        val exec = Executors.newSingleThreadScheduledExecutor { r ->
            Thread(r, "RadiacodePoll")
        }
        pollExecutor = exec
        pollTask = exec.scheduleAtFixedRate({
            pollTick()
        }, 100L, POLL_INTERVAL_MS, TimeUnit.MILLISECONDS)
    }

    private fun pollTick() {
        val rc = radiaCode ?: return
        if (!deviceReady) return
        try {
            val records = rc.dataBuf(POLL_TIMEOUT_MS)
            consecutiveTimeouts = 0
            reconnectAttempt = 0
            val measurement = MeasurementMapper.map(records)
            if (measurement != null) {
                if (measurement.doseUSv != null) {
                    rareSeenThisSession = true
                }
                onMeasurementReceived(measurement)
            }
            maybeBootstrapRareStream()
        } catch (e: ConnectionClosed) {
            Log.w(TAG, "Poll tick — connection closed", e)
            handleConnectionLost()
            scheduleReconnect("connection closed")
        } catch (e: TransportTimeout) {
            consecutiveTimeouts++
            Log.w(TAG, "Poll tick — transport timeout #$consecutiveTimeouts", e)
            if (consecutiveTimeouts >= MAX_CONSECUTIVE_TIMEOUTS) {
                // Halb-tote Session: Android sieht den Disconnect nicht (kein
                // STATE_DISCONNECTED, weil Writes weiter „erfolgreich" auf
                // L2CAP-Ebene durchgehen), aber das Gerät antwortet nicht mehr.
                // Forciert teardown + reconnect mit der zuletzt verwendeten
                // Adresse.
                handleConnectionLost()
                scheduleReconnect("$consecutiveTimeouts consecutive timeouts")
            }
        } catch (t: Throwable) {
            Log.w(TAG, "Poll tick failed", t)
        }
    }

    /**
     * Wenn nach `RARE_BOOTSTRAP_TIMEOUT_MS` seit Session-Start kein Rare-Record
     * (Dose/Akku/Temperatur) gekommen ist, einmaligen Force-Reconnect mit
     * frischem GATT auslösen — exakt das, was beim manuellen Trennen+Verbinden
     * passiert und nachweislich den Rare-Stream startet, wenn das Gerät erst
     * nach dem App-Connect eingeschaltet wurde.
     *
     * Triggert pro Adresse höchstens einmal: gibt es nach dem Bootstrap immer
     * noch keine Rare-Records, ist die Schleife schlimmer als der Defekt.
     * Reset des Flags nur in `teardownSession` (User-Disconnect).
     */
    private fun maybeBootstrapRareStream() {
        if (rareSeenThisSession) return
        if (rareBootstrapAttempted) return
        if (sessionReadyMs == 0L) return
        val elapsed = System.currentTimeMillis() - sessionReadyMs
        if (elapsed < RARE_BOOTSTRAP_TIMEOUT_MS) return
        rareBootstrapAttempted = true
        Log.w(
            TAG,
            "rare-bootstrap — kein Rare-Record nach ${elapsed}ms, erzwinge frischen GATT-Reconnect",
        )
        handleConnectionLost()
        scheduleReconnect("rare-bootstrap (frischer GATT)")
    }

    /**
     * Plant einen Reconnect-Versuch über den `bleWorker` mit exponentiellem
     * Backoff. Persistent — versucht weiter, bis der User explizit
     * disconnected (ACTION_BLE_DISCONNECT → teardownSession → currentAddress=null)
     * oder eine neue Session schon aktiv ist. Erhöht [reconnectAttempt]; das
     * nächste Backoff-Intervall richtet sich nach diesem Counter.
     *
     * Setzt selbst KEIN `handleConnectionLost` — der Aufrufer muss vorher die
     * Session sauber abbauen.
     */
    private fun scheduleReconnect(reason: String) {
        val address = currentAddress
        if (address == null) {
            Log.i(TAG, "scheduleReconnect — no address (user disconnected), giving up")
            reconnectAttempt = 0
            return
        }
        val worker = bleWorker
        if (worker == null || worker.isShutdown) {
            Log.w(TAG, "scheduleReconnect — bleWorker not available, giving up")
            reconnectAttempt = 0
            return
        }
        val delayIdx = reconnectAttempt.coerceAtMost(RECONNECT_BACKOFF_MS.size - 1)
        val delay = RECONNECT_BACKOFF_MS[delayIdx]
        reconnectAttempt++
        Log.w(
            TAG,
            "scheduleReconnect — reason: $reason, attempt=$reconnectAttempt, delay=${delay}ms, address=$address",
        )
        consecutiveTimeouts = 0
        worker.execute {
            try {
                Thread.sleep(delay)
            } catch (ie: InterruptedException) {
                Thread.currentThread().interrupt()
                return@execute
            }
            // Wurde die Session in der Zwischenzeit explizit beendet
            // (ACTION_BLE_DISCONNECT → teardownSession → currentAddress=null),
            // dann nicht reconnecten.
            if (currentAddress != address) {
                Log.i(TAG, "scheduleReconnect — aborted, currentAddress changed (was=$address now=$currentAddress)")
                reconnectAttempt = 0
                return@execute
            }
            // Falls währenddessen jemand schon eine neue Session aufgebaut hat,
            // ebenfalls abbrechen.
            if (radiaCode != null) {
                Log.i(TAG, "scheduleReconnect — aborted, session already active")
                reconnectAttempt = 0
                return@execute
            }
            Log.i(TAG, "scheduleReconnect — attempting reconnect to $address (attempt=$reconnectAttempt)")
            startBleSession(address)
        }
    }

    private fun stopPollLoop() {
        pollTask?.cancel(false)
        pollTask = null
        pollExecutor?.shutdown()
        pollExecutor = null
    }

    private fun teardownSession() {
        Log.i(
            TAG,
            "teardownSession — session=${if (radiaCode != null) "active" else "none"}",
        )
        stopPollLoop()
        trackRecorder?.stop()
        trackRecorder = null
        // HIGH_ACCURACY-LocationRequest läuft bewusst weiter, bis der Service
        // komplett terminiert (onDestroy). Solange der Service lebt, soll die
        // App durchgängig präzise GPS-Fixes bekommen — unabhängig von der
        // Radiacode-Session.
        try { radiaCode?.close() } catch (_: Throwable) { /* best effort */ }
        radiaCode = null
        transport = null
        currentAddress = null
        deviceReady = false
        // Reconnect-Counter zurücksetzen — beim nächsten manuellen Connect
        // soll der Backoff wieder beim kürzesten Delay anfangen. Der laufende
        // Reconnect-Worker (falls einer geplant ist) stoppt sich selbst, weil
        // er `currentAddress = null` sieht.
        consecutiveTimeouts = 0
        reconnectAttempt = 0
        // Bootstrap-State zurücksetzen — neuer User-initiierter Connect soll
        // wieder einen Rare-Bootstrap-Versuch erlauben können.
        rareSeenThisSession = false
        rareBootstrapAttempted = false
        sessionReadyMs = 0L
        // Rare-Cache leeren — er soll nur innerhalb derselben Session gelten,
        // damit nach einem expliziten Disconnect+Reconnect keine veralteten
        // Werte aus einer früheren Session zurückkommen.
        cachedDoseUSv = null
        cachedDurationSec = null
        cachedTemperatureC = null
        cachedChargePct = null
    }

    /**
     * Hält den GPS-Chip im PRIORITY_HIGH_ACCURACY-Modus, solange die Radiacode-
     * Session läuft. Ohne aktiven LocationRequest drosselt Android 14+ den
     * GPS-Fix nach einigen Minuten auf Balanced Power, obwohl der Service mit
     * FOREGROUND_SERVICE_TYPE_LOCATION deklariert ist. Die WebView-
     * `navigator.geolocation` piggybackt auf diesem Request — ihr Fix bleibt
     * dadurch durchgehend präzise, auch bei gesperrtem Screen.
     *
     * Der LocationCallback ist bewusst leer: wir wollen nur den HW-Provider
     * warm halten, nicht die Position selbst konsumieren (das macht die
     * WebView).
     */
    private fun startHighAccuracyLocation() {
        if (locationActive) return
        val fine = ContextCompat.checkSelfPermission(
            this, Manifest.permission.ACCESS_FINE_LOCATION,
        )
        val coarse = ContextCompat.checkSelfPermission(
            this, Manifest.permission.ACCESS_COARSE_LOCATION,
        )
        if (fine != PackageManager.PERMISSION_GRANTED &&
            coarse != PackageManager.PERMISSION_GRANTED
        ) {
            Log.w(TAG, "startHighAccuracyLocation — no location permission, skipping")
            return
        }
        val client = fusedLocation
            ?: LocationServices.getFusedLocationProviderClient(applicationContext).also {
                fusedLocation = it
            }
        val request = LocationRequest.Builder(Priority.PRIORITY_HIGH_ACCURACY, 1_000L)
            .setMinUpdateIntervalMillis(500L)
            .setWaitForAccurateLocation(false)
            .build()
        val cb = object : LocationCallback() {
            override fun onLocationResult(result: LocationResult) {
                // WebView konsumiert die Position selbst. Wir merken zusätzlich
                // den letzten Fix, damit TrackRecorder auch im Hintergrund weiss,
                // wo der nächste Marker hinsoll.
                result.lastLocation?.let { loc ->
                    lastLocation = loc
                    gpsTrackRecorder?.onLocation(loc.latitude, loc.longitude)
                    liveLocationPusher?.onLocation(
                        loc.latitude, loc.longitude,
                        accuracy = loc.accuracy.toDouble().takeIf { loc.hasAccuracy() },
                        heading  = loc.bearing.toDouble().takeIf { loc.hasBearing() },
                        speed    = loc.speed.toDouble().takeIf { loc.hasSpeed() },
                    )
                }
            }
        }
        locationCallback = cb
        try {
            client.requestLocationUpdates(request, cb, Looper.getMainLooper()).addOnFailureListener { t ->
                Log.w(TAG, "requestLocationUpdates failed", t)
            }
            locationActive = true
            Log.i(TAG, "startHighAccuracyLocation — GPS-Chip im HIGH_ACCURACY-Mode")
        } catch (e: SecurityException) {
            Log.w(TAG, "requestLocationUpdates SecurityException", e)
            locationCallback = null
        }
    }

    private fun stopHighAccuracyLocation() {
        val cb = locationCallback ?: return
        val client = fusedLocation ?: return
        try {
            client.removeLocationUpdates(cb)
            Log.i(TAG, "stopHighAccuracyLocation — GPS-Updates gestoppt")
        } catch (t: Throwable) {
            Log.w(TAG, "removeLocationUpdates failed", t)
        }
        locationCallback = null
        locationActive = false
    }

    private fun parseSampleRate(intent: Intent): SampleRate {
        val kind = intent.getStringExtra(EXTRA_SAMPLE_RATE_KIND) ?: "normal"
        if (kind != "custom") return SampleRate.fromString(kind)
        fun dbl(name: String): Double? =
            if (intent.hasExtra(name)) intent.getDoubleExtra(name, Double.NaN).takeIf { !it.isNaN() }
            else null
        return SampleRate.Custom(
            maxIntervalSec       = dbl(EXTRA_CUSTOM_INTERVAL),
            minDistanceMeters    = dbl(EXTRA_CUSTOM_DISTANCE),
            minDoseRateDeltaUSvH = dbl(EXTRA_CUSTOM_DOSE_DELTA),
        )
    }

    private fun updateNotificationForState() {
        val track = gpsTrackRecorder != null || trackRecorder != null
        val liveShare = liveLocationPusher != null
        val title = when {
            radiaCode != null && !deviceReady -> "Radiacode – Verbindung verloren"
            radiaCode != null && trackRecorder != null && gpsTrackRecorder != null -> "Radiacode + GPS-Aufzeichnung"
            radiaCode != null && trackRecorder != null -> "Strahlenmessung läuft"
            radiaCode != null && gpsTrackRecorder != null -> "Radiacode + GPS-Aufzeichnung"
            radiaCode != null -> "Radiacode verbunden"
            // Kein Radiacode aktiv — Modi nur GPS-Track / Live-Share
            track && liveShare -> {
                val name = liveShareFirecallName
                if (name.isBlank()) "Standort wird aufgezeichnet & geteilt"
                else "Standort wird aufgezeichnet & geteilt — $name"
            }
            liveShare -> {
                val name = liveShareFirecallName
                if (name.isBlank()) "Live-Standort wird geteilt"
                else "Live-Standort wird geteilt — $name"
            }
            track -> "GPS-Aufzeichnung läuft"
            else -> "Radiacode getrennt"
        }
        lastTitle = title
        ensureForeground()
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
