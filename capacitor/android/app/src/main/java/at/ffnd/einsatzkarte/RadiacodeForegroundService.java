package at.ffnd.einsatzkarte;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import android.os.IBinder;
import android.os.PowerManager;

import androidx.annotation.Nullable;
import androidx.core.app.NotificationCompat;

public class RadiacodeForegroundService extends Service {

    public static final String CHANNEL_ID = "radiacode_connection";
    public static final int NOTIFICATION_ID = 4711;

    // Hält die CPU wach, solange eine Radiacode-Session läuft. Ohne WakeLock
    // drosselt Android im Standby BLE-GATT-Callbacks und `setTimeout` im
    // WebView, und das Polling friert ein.
    public static final String WAKE_LOCK_TAG = "einsatzkarte:radiacode";

    private PowerManager.WakeLock wakeLock;

    public static final String ACTION_START = "at.ffnd.einsatzkarte.RADIACODE_START";
    public static final String ACTION_UPDATE = "at.ffnd.einsatzkarte.RADIACODE_UPDATE";
    public static final String ACTION_STOP = "at.ffnd.einsatzkarte.RADIACODE_STOP";
    public static final String ACTION_DISCONNECT_REQUESTED =
            "at.ffnd.einsatzkarte.RADIACODE_DISCONNECT_REQUESTED";

    public static final String EXTRA_TITLE = "title";
    public static final String EXTRA_BODY = "body";

    @Override
    public void onCreate() {
        super.onCreate();
        ensureChannel();
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        String action = intent != null ? intent.getAction() : null;
        if (ACTION_START.equals(action)) {
            String title = intent.getStringExtra(EXTRA_TITLE);
            String body = intent.getStringExtra(EXTRA_BODY);
            startForeground(NOTIFICATION_ID, buildNotification(
                    title != null ? title : "Radiacode verbunden",
                    body != null ? body : ""));
            acquireWakeLock();
        } else if (ACTION_UPDATE.equals(action)) {
            String title = intent.getStringExtra(EXTRA_TITLE);
            String body = intent.getStringExtra(EXTRA_BODY);
            NotificationManager nm = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
            if (nm != null) {
                nm.notify(NOTIFICATION_ID, buildNotification(
                        title != null ? title : "Radiacode verbunden",
                        body != null ? body : ""));
            }
        } else if (ACTION_STOP.equals(action)) {
            releaseWakeLock();
            stopForeground(STOP_FOREGROUND_REMOVE);
            stopSelf();
        } else if (ACTION_DISCONNECT_REQUESTED.equals(action)) {
            RadiacodeNotificationPlugin.onDisconnectRequested();
        }
        return START_NOT_STICKY;
    }

    @Nullable
    @Override
    public IBinder onBind(Intent intent) { return null; }

    @Override
    public void onDestroy() {
        releaseWakeLock();
        super.onDestroy();
    }

    private void acquireWakeLock() {
        if (wakeLock != null && wakeLock.isHeld()) return;
        PowerManager pm = (PowerManager) getSystemService(Context.POWER_SERVICE);
        if (pm == null) return;
        wakeLock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, WAKE_LOCK_TAG);
        wakeLock.setReferenceCounted(false);
        // Kein Timeout: Lifecycle ist an den Service gekoppelt (ACTION_STOP /
        // onDestroy geben frei). Android lintet `acquire()` ohne Timeout,
        // aber hier ist deterministisches Halten gewollt.
        wakeLock.acquire();
    }

    private void releaseWakeLock() {
        if (wakeLock != null && wakeLock.isHeld()) {
            wakeLock.release();
        }
        wakeLock = null;
    }

    private Notification buildNotification(String title, String body) {
        Intent tapIntent = new Intent(this, MainActivity.class);
        tapIntent.setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        PendingIntent tapPending = PendingIntent.getActivity(
                this, 0, tapIntent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);

        Intent disconnectIntent = new Intent(this, RadiacodeForegroundService.class);
        disconnectIntent.setAction(ACTION_DISCONNECT_REQUESTED);
        PendingIntent disconnectPending = PendingIntent.getService(
                this, 1, disconnectIntent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);

        return new NotificationCompat.Builder(this, CHANNEL_ID)
                .setSmallIcon(R.drawable.ic_launcher_foreground)
                .setContentTitle(title)
                .setContentText(body)
                .setOngoing(true)
                .setOnlyAlertOnce(true)
                .setContentIntent(tapPending)
                .addAction(
                        0,
                        getString(R.string.radiacode_notification_action_disconnect),
                        disconnectPending)
                .setPriority(NotificationCompat.PRIORITY_LOW)
                .setCategory(NotificationCompat.CATEGORY_SERVICE)
                .build();
    }

    private void ensureChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationManager nm = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
        if (nm == null) return;
        if (nm.getNotificationChannel(CHANNEL_ID) != null) return;
        NotificationChannel channel = new NotificationChannel(
                CHANNEL_ID,
                getString(R.string.radiacode_notification_channel_name),
                NotificationManager.IMPORTANCE_LOW);
        channel.setDescription(getString(R.string.radiacode_notification_channel_desc));
        channel.setShowBadge(false);
        nm.createNotificationChannel(channel);
    }

    public static Intent startIntent(Context ctx, String title, String body) {
        Intent i = new Intent(ctx, RadiacodeForegroundService.class);
        i.setAction(ACTION_START);
        i.putExtra(EXTRA_TITLE, title);
        i.putExtra(EXTRA_BODY, body);
        return i;
    }

    public static Intent updateIntent(Context ctx, String title, String body) {
        Intent i = new Intent(ctx, RadiacodeForegroundService.class);
        i.setAction(ACTION_UPDATE);
        i.putExtra(EXTRA_TITLE, title);
        i.putExtra(EXTRA_BODY, body);
        return i;
    }

    public static Intent stopIntent(Context ctx) {
        Intent i = new Intent(ctx, RadiacodeForegroundService.class);
        i.setAction(ACTION_STOP);
        return i;
    }
}
