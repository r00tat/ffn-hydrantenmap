package at.ffnd.einsatzkarte;

import android.content.Context;
import android.content.Intent;
import android.os.Build;
import android.util.Base64;
import android.util.Log;

import at.ffnd.einsatzkarte.radiacode.Measurement;

import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

import java.util.Locale;

@CapacitorPlugin(
        name = "RadiacodeNotification",
        permissions = {
                @Permission(
                        alias = "notifications",
                        strings = { "android.permission.POST_NOTIFICATIONS" })
        })
public class RadiacodeNotificationPlugin extends Plugin {

    private static final String TAG = "RadiacodeFg";

    private static RadiacodeNotificationPlugin instance;

    @Override
    public void load() {
        instance = this;
    }

    @Override
    protected void handleOnDestroy() {
        if (instance == this) instance = null;
        super.handleOnDestroy();
    }

    /**
     * Starts RadiacodeForegroundService as a foreground-capable service on
     * Android 8+. The service must call startForeground(..) from onStartCommand
     * within 10 s or Android throws ForegroundServiceDidNotStartInTimeException.
     * Our service does that eagerly via ensureForeground() for every action
     * except ACTION_STOP/ACTION_DISCONNECT_REQUESTED.
     */
    private void startService(Intent intent) {
        Context ctx = getContext();
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            ctx.startForegroundService(intent);
        } else {
            ctx.startService(intent);
        }
    }

    @PluginMethod
    public void connectNative(PluginCall call) {
        String address = call.getString("deviceAddress");
        Log.i(TAG, "plugin.connectNative address=" + address);
        if (address == null || address.isEmpty()) {
            Log.w(TAG, "plugin.connectNative rejected — missing deviceAddress");
            call.reject("deviceAddress required");
            return;
        }

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            if (getPermissionState("notifications") != PermissionState.GRANTED) {
                Log.i(TAG, "plugin.connectNative requesting POST_NOTIFICATIONS permission");
                requestPermissionForAlias("notifications", call, "permissionCallback");
            }
        }

        Intent intent = new Intent(getContext(), RadiacodeForegroundService.class);
        intent.setAction(RadiacodeForegroundService.ACTION_BLE_CONNECT);
        intent.putExtra(RadiacodeForegroundService.EXTRA_DEVICE_ADDRESS, address);
        startService(intent);
        call.resolve();
    }

    @PluginMethod
    public void getState(PluginCall call) {
        RadiacodeForegroundService service = RadiacodeForegroundService.Companion.getInstance();
        JSObject ret = new JSObject();
        if (service != null) {
            ret.put("connected", service.isBleConnected());
            ret.put("deviceAddress", service.getDeviceAddress());
            ret.put("radiacodeTracking", service.isRadiacodeTracking());
            ret.put("gpsTracking", service.isGpsTracking());
        } else {
            ret.put("connected", false);
            ret.put("deviceAddress", null);
            ret.put("radiacodeTracking", false);
            ret.put("gpsTracking", false);
        }
        call.resolve(ret);
    }

    @PluginMethod
    public void writeNative(PluginCall call) {
        String payloadB64 = call.getString("payload");
        if (payloadB64 == null) {
            Log.w(TAG, "plugin.writeNative rejected — missing payload");
            call.reject("payload required (base64)");
            return;
        }
        byte[] payload;
        try {
            payload = Base64.decode(payloadB64, Base64.NO_WRAP);
        } catch (IllegalArgumentException e) {
            Log.w(TAG, "plugin.writeNative rejected — payload not base64", e);
            call.reject("payload is not valid base64");
            return;
        }
        Log.d(TAG, "plugin.writeNative bytes=" + payload.length);
        Intent intent = new Intent(getContext(), RadiacodeForegroundService.class);
        intent.setAction(RadiacodeForegroundService.ACTION_BLE_WRITE);
        intent.putExtra(RadiacodeForegroundService.EXTRA_PAYLOAD, payload);
        startService(intent);
        call.resolve();
    }

    @PluginMethod
    public void disconnectNative(PluginCall call) {
        Log.i(TAG, "plugin.disconnectNative");
        Intent intent = new Intent(getContext(), RadiacodeForegroundService.class);
        intent.setAction(RadiacodeForegroundService.ACTION_BLE_DISCONNECT);
        startService(intent);
        call.resolve();
    }

    @PluginMethod
    public void startTrackRecording(PluginCall call) {
        String firecallId = call.getString("firecallId");
        String layerId = call.getString("layerId");
        String sampleRate = call.getString("sampleRate");
        String deviceLabel = call.getString("deviceLabel", "");
        String creator = call.getString("creator", "");
        String firestoreDb = call.getString("firestoreDb", "");
        if (firecallId == null || layerId == null || (sampleRate == null && call.getString("sampleRateKind") == null)) {
            call.reject("firecallId, layerId, and (sampleRate or sampleRateKind) required");
            return;
        }
        Log.i(TAG, "plugin.startTrackRecording firecallId=" + firecallId + " layerId=" + layerId + " rate=" + sampleRate);
        Intent intent = new Intent(getContext(), RadiacodeForegroundService.class);
        intent.setAction(RadiacodeForegroundService.ACTION_START_TRACK);
        intent.putExtra(RadiacodeForegroundService.EXTRA_FIRECALL_ID, firecallId);
        intent.putExtra(RadiacodeForegroundService.EXTRA_LAYER_ID, layerId);
        intent.putExtra(RadiacodeForegroundService.EXTRA_SAMPLE_RATE, sampleRate);
        intent.putExtra(RadiacodeForegroundService.EXTRA_DEVICE_LABEL, deviceLabel);
        intent.putExtra(RadiacodeForegroundService.EXTRA_CREATOR, creator);
        intent.putExtra(RadiacodeForegroundService.EXTRA_FIRESTORE_DB, firestoreDb);
        String kind = call.getString("sampleRateKind");
        if (kind != null) {
            intent.putExtra(RadiacodeForegroundService.EXTRA_SAMPLE_RATE_KIND, kind);
            if ("custom".equals(kind)) {
                Double intv  = call.getDouble("customIntervalSec");
                Double dist  = call.getDouble("customDistanceM");
                Double ddose = call.getDouble("customDoseRateDeltaUSvH");
                if (intv  != null) intent.putExtra(RadiacodeForegroundService.EXTRA_CUSTOM_INTERVAL, intv.doubleValue());
                if (dist  != null) intent.putExtra(RadiacodeForegroundService.EXTRA_CUSTOM_DISTANCE, dist.doubleValue());
                if (ddose != null) intent.putExtra(RadiacodeForegroundService.EXTRA_CUSTOM_DOSE_DELTA, ddose.doubleValue());
            }
        }
        startService(intent);
        call.resolve();
    }

    @PluginMethod
    public void stopTrackRecording(PluginCall call) {
        Log.i(TAG, "plugin.stopTrackRecording");
        Intent intent = new Intent(getContext(), RadiacodeForegroundService.class);
        intent.setAction(RadiacodeForegroundService.ACTION_STOP_TRACK);
        // Kein startForegroundService — der Service läuft bereits (BLE aktiv).
        getContext().startService(intent);
        call.resolve();
    }

    @PluginMethod
    public void startGpsTrack(PluginCall call) {
        String firecallId = call.getString("firecallId");
        String lineId     = call.getString("lineId");
        String firestoreDb= call.getString("firestoreDb", "");
        String creator    = call.getString("creator", "");
        String kind       = call.getString("sampleRateKind", "normal");
        Double initLat    = call.getDouble("initialLat");
        Double initLng    = call.getDouble("initialLng");
        if (firecallId == null || lineId == null) {
            call.reject("firecallId, lineId required");
            return;
        }
        Log.i(TAG, "plugin.startGpsTrack firecallId=" + firecallId + " lineId=" + lineId + " kind=" + kind);
        Intent intent = new Intent(getContext(), RadiacodeForegroundService.class);
        intent.setAction(RadiacodeForegroundService.ACTION_START_GPS_TRACK);
        intent.putExtra(RadiacodeForegroundService.EXTRA_FIRECALL_ID, firecallId);
        intent.putExtra(RadiacodeForegroundService.EXTRA_LINE_ID, lineId);
        intent.putExtra(RadiacodeForegroundService.EXTRA_FIRESTORE_DB, firestoreDb);
        intent.putExtra(RadiacodeForegroundService.EXTRA_CREATOR, creator);
        intent.putExtra(RadiacodeForegroundService.EXTRA_SAMPLE_RATE_KIND, kind);
        if (initLat != null) intent.putExtra(RadiacodeForegroundService.EXTRA_INITIAL_LAT, initLat.doubleValue());
        if (initLng != null) intent.putExtra(RadiacodeForegroundService.EXTRA_INITIAL_LNG, initLng.doubleValue());
        if ("custom".equals(kind)) {
            Double intv  = call.getDouble("customIntervalSec");
            Double dist  = call.getDouble("customDistanceM");
            Double ddose = call.getDouble("customDoseRateDeltaUSvH");
            if (intv  != null) intent.putExtra(RadiacodeForegroundService.EXTRA_CUSTOM_INTERVAL, intv.doubleValue());
            if (dist  != null) intent.putExtra(RadiacodeForegroundService.EXTRA_CUSTOM_DISTANCE, dist.doubleValue());
            if (ddose != null) intent.putExtra(RadiacodeForegroundService.EXTRA_CUSTOM_DOSE_DELTA, ddose.doubleValue());
        }
        startService(intent);
        call.resolve();
    }

    @PluginMethod
    public void stopGpsTrack(PluginCall call) {
        Log.i(TAG, "plugin.stopGpsTrack");
        Intent intent = new Intent(getContext(), RadiacodeForegroundService.class);
        intent.setAction(RadiacodeForegroundService.ACTION_STOP_GPS_TRACK);
        getContext().startService(intent);
        call.resolve();
    }

    @PermissionCallback
    private void permissionCallback(PluginCall call) {
        // Notification-Permission ist best-effort — Ergebnis bewusst ignoriert.
    }

    static void onDisconnectRequested() {
        RadiacodeNotificationPlugin i = instance;
        Log.i(TAG, "onDisconnectRequested hasInstance=" + (i != null));
        if (i != null) {
            i.notifyListeners("disconnectRequested", new JSObject());
        }
    }

    public static void emitMeasurement(Measurement m) {
        RadiacodeNotificationPlugin i = instance;
        if (i == null) return;
        JSObject data = new JSObject();
        data.put("timestampMs", m.getTimestampMs());
        data.put("dosisleistungUSvH", m.getDosisleistungUSvH());
        data.put("cps", m.getCps());
        if (m.getDoseUSv() != null) data.put("doseUSv", m.getDoseUSv());
        if (m.getDurationSec() != null) data.put("durationSec", m.getDurationSec());
        if (m.getTemperatureC() != null) data.put("temperatureC", m.getTemperatureC());
        if (m.getChargePct() != null) data.put("chargePct", m.getChargePct());
        if (m.getDosisleistungErrPct() != null)
            data.put("dosisleistungErrPct", m.getDosisleistungErrPct());
        if (m.getCpsErrPct() != null) data.put("cpsErrPct", m.getCpsErrPct());
        i.notifyListeners("measurement", data);
    }

    public static void emitNotification(byte[] bytes) {
        RadiacodeNotificationPlugin i = instance;
        if (i == null) {
            Log.w(TAG, "emitNotification — no plugin instance; dropping " + bytes.length + " bytes");
            return;
        }
        JSObject data = new JSObject();
        data.put("bytes", Base64.encodeToString(bytes, Base64.NO_WRAP));
        i.notifyListeners("notification", data);
    }

    public static void emitConnectionState(String state) {
        RadiacodeNotificationPlugin i = instance;
        Log.i(TAG, "emitConnectionState state=" + state + " hasInstance=" + (i != null));
        if (i == null) return;
        JSObject data = new JSObject();
        data.put("state", state);
        i.notifyListeners("connectionState", data);
    }

    public static void emitMarkerWritten(String docId, String layerId,
                                         double lat, double lng, long timestampMs,
                                         double dosisleistungUSvH, double cps) {
        RadiacodeNotificationPlugin i = instance;
        if (i == null) {
            Log.w(TAG, "emitMarkerWritten — no plugin instance; dropping");
            return;
        }
        JSObject data = new JSObject();
        data.put("docId", docId);
        data.put("layerId", layerId);
        data.put("lat", lat);
        data.put("lng", lng);
        data.put("timestampMs", timestampMs);
        data.put("dosisleistungUSvH", dosisleistungUSvH);
        data.put("cps", cps);
        i.notifyListeners("markerWritten", data);
    }
}
