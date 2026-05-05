package at.ffnd.einsatzkarte

import android.Manifest
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.provider.Settings
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import com.getcapacitor.annotation.Permission
import com.getcapacitor.annotation.PermissionCallback

@CapacitorPlugin(
    name = "AppPermissions",
    permissions = [
        Permission(
            alias = "location",
            strings = [
                Manifest.permission.ACCESS_FINE_LOCATION,
                Manifest.permission.ACCESS_COARSE_LOCATION,
            ]
        ),
        Permission(
            alias = "notifications",
            strings = ["android.permission.POST_NOTIFICATIONS"]
        ),
        Permission(
            alias = "bluetooth",
            strings = [
                "android.permission.BLUETOOTH_SCAN",
                "android.permission.BLUETOOTH_CONNECT",
            ]
        ),
    ]
)
class AppPermissionsPlugin : Plugin() {

    private val prefsName = "app_permissions"

    @PluginMethod
    fun checkPermission(call: PluginCall) {
        val type = call.getString("type") ?: return call.reject("type required")
        val state = computeState(type)
        call.resolve(JSObject().put("state", state))
    }

    @PluginMethod
    fun requestPermission(call: PluginCall) {
        val type = call.getString("type") ?: return call.reject("type required")
        val perms = permsForType(type)
        if (perms.isEmpty()) {
            call.resolve(JSObject().put("state", "granted"))
            return
        }
        val prefs = context.getSharedPreferences(prefsName, Context.MODE_PRIVATE).edit()
        perms.forEach { prefs.putBoolean("hasRequested:$it", true) }
        prefs.apply()

        requestPermissionForAlias(type, call, "permissionCallback")
    }

    @PermissionCallback
    private fun permissionCallback(call: PluginCall) {
        val type = call.getString("type") ?: return call.reject("type required")
        call.resolve(JSObject().put("state", computeState(type)))
    }

    @PluginMethod
    fun openAppSettings(call: PluginCall) {
        val intent = Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS).apply {
            data = Uri.fromParts("package", context.packageName, null)
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        }
        context.startActivity(intent)
        call.resolve()
    }

    private fun permsForType(type: String): List<String> = when (type) {
        "location" -> listOf(
            Manifest.permission.ACCESS_FINE_LOCATION,
            Manifest.permission.ACCESS_COARSE_LOCATION,
        )
        "notifications" -> if (Build.VERSION.SDK_INT >= 33)
            listOf("android.permission.POST_NOTIFICATIONS")
        else emptyList()
        "bluetooth" -> if (Build.VERSION.SDK_INT >= 31) listOf(
            "android.permission.BLUETOOTH_SCAN",
            "android.permission.BLUETOOTH_CONNECT",
        ) else emptyList()
        else -> emptyList()
    }

    private fun computeState(type: String): String {
        val perms = permsForType(type)
        if (perms.isEmpty()) return "granted"

        val granted = perms.all {
            ContextCompat.checkSelfPermission(context, it) == PackageManager.PERMISSION_GRANTED
        }
        if (granted) return "granted"

        val sharedPrefs = context.getSharedPreferences(prefsName, Context.MODE_PRIVATE)
        val askedBefore = perms.any { sharedPrefs.getBoolean("hasRequested:$it", false) }
        if (!askedBefore) return "prompt"

        val act = activity ?: return "denied"
        val rationale = perms.any {
            ActivityCompat.shouldShowRequestPermissionRationale(act, it)
        }
        return if (rationale) "denied" else "permanentlyDenied"
    }
}
