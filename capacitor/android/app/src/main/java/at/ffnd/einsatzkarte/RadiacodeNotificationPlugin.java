package at.ffnd.einsatzkarte;

import android.content.Context;
import android.content.Intent;
import android.os.Build;

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
        Intent intent = RadiacodeForegroundService.startIntent(ctx, title, body);
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
                RadiacodeForegroundService.updateIntent(getContext(), title, body));
        call.resolve();
    }

    @PluginMethod
    public void stop(PluginCall call) {
        getContext().startService(RadiacodeForegroundService.stopIntent(getContext()));
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
