package at.ffnd.einsatzkarte;

import android.content.Context;
import android.content.Intent;
import android.os.Build;
import android.util.Base64;

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

    @PluginMethod
    public void start(PluginCall call) {
        String title = call.getString("title", "Radiacode verbunden");
        String body = call.getString("body", "");
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            if (getPermissionState("notifications") != PermissionState.GRANTED) {
                requestPermissionForAlias("notifications", call, "permissionCallback");
                // Service wird trotzdem gestartet — ohne Permission bleibt die Notification stumm.
            }
        }
        Context ctx = getContext();
        Intent intent = RadiacodeForegroundService.Companion.startIntent(ctx, title, body);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            ctx.startForegroundService(intent);
        } else {
            ctx.startService(intent);
        }
        call.resolve();
    }

    @PluginMethod
    public void update(PluginCall call) {
        Double doseD = call.getDouble("dosisleistung");
        Double cpsD = call.getDouble("cps");
        double dose = doseD != null ? doseD : 0.0;
        double cps = cpsD != null ? cpsD : 0.0;
        String state = call.getString("state", "connected");
        String title = titleForState(state);
        String body = formatBody(dose, cps, state);
        getContext().startService(
                RadiacodeForegroundService.Companion.updateIntent(getContext(), title, body));
        call.resolve();
    }

    @PluginMethod
    public void stop(PluginCall call) {
        getContext().startService(RadiacodeForegroundService.Companion.stopIntent(getContext()));
        call.resolve();
    }

    @PluginMethod
    public void connectNative(PluginCall call) {
        String address = call.getString("deviceAddress");
        if (address == null || address.isEmpty()) {
            call.reject("deviceAddress required");
            return;
        }
        Intent intent = new Intent(getContext(), RadiacodeForegroundService.class);
        intent.setAction(RadiacodeForegroundService.ACTION_BLE_CONNECT);
        intent.putExtra(RadiacodeForegroundService.EXTRA_DEVICE_ADDRESS, address);
        getContext().startService(intent);
        call.resolve();
    }

    @PluginMethod
    public void writeNative(PluginCall call) {
        String payloadB64 = call.getString("payload");
        if (payloadB64 == null) {
            call.reject("payload required (base64)");
            return;
        }
        byte[] payload;
        try {
            payload = Base64.decode(payloadB64, Base64.NO_WRAP);
        } catch (IllegalArgumentException e) {
            call.reject("payload is not valid base64");
            return;
        }
        Intent intent = new Intent(getContext(), RadiacodeForegroundService.class);
        intent.setAction(RadiacodeForegroundService.ACTION_BLE_WRITE);
        intent.putExtra(RadiacodeForegroundService.EXTRA_PAYLOAD, payload);
        getContext().startService(intent);
        call.resolve();
    }

    @PluginMethod
    public void disconnectNative(PluginCall call) {
        Intent intent = new Intent(getContext(), RadiacodeForegroundService.class);
        intent.setAction(RadiacodeForegroundService.ACTION_BLE_DISCONNECT);
        getContext().startService(intent);
        call.resolve();
    }

    @PermissionCallback
    private void permissionCallback(PluginCall call) {
        // Notification-Permission ist best-effort — Ergebnis bewusst ignoriert.
    }

    static void onDisconnectRequested() {
        RadiacodeNotificationPlugin i = instance;
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
        if (i == null) return;
        JSObject data = new JSObject();
        data.put("bytes", Base64.encodeToString(bytes, Base64.NO_WRAP));
        i.notifyListeners("notification", data);
    }

    public static void emitConnectionState(String state) {
        RadiacodeNotificationPlugin i = instance;
        if (i == null) return;
        JSObject data = new JSObject();
        data.put("state", state);
        i.notifyListeners("connectionState", data);
    }

    private static String titleForState(String state) {
        if ("recording".equals(state)) return "Strahlenmessung läuft";
        if ("reconnecting".equals(state)) return "Radiacode – Verbindung verloren";
        return "Radiacode verbunden";
    }

    private static String formatBody(double dose, double cps, String state) {
        String body = String.format(Locale.GERMAN, "%.2f µSv/h · %d CPS", dose, Math.round(cps));
        if ("reconnecting".equals(state)) return body + " (letzter Wert)";
        return body;
    }
}
