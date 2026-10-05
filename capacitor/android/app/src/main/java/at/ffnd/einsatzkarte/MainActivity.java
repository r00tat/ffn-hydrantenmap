package at.ffnd.einsatzkarte;

import android.app.AlertDialog;
import android.content.DialogInterface;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.res.AssetManager;
import android.graphics.Bitmap;
import android.net.ConnectivityManager;
import android.net.Network;
import android.net.NetworkCapabilities;
import android.net.http.SslError;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.util.Log;
import android.webkit.RenderProcessGoneDetail;
import android.webkit.SslErrorHandler;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.view.Window;

import androidx.annotation.RequiresApi;
import androidx.swiperefreshlayout.widget.SwipeRefreshLayout;
import androidx.core.splashscreen.SplashScreen;
import androidx.core.view.WindowCompat;
import androidx.webkit.WebSettingsCompat;
import androidx.webkit.WebViewFeature;

import com.getcapacitor.BridgeActivity;
import com.getcapacitor.BridgeWebViewClient;
import com.getcapacitor.CapConfig;
import com.google.firebase.crashlytics.FirebaseCrashlytics;

import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;

public class MainActivity extends BridgeActivity {
    private static final String TAG = "MainActivity";
    private boolean errorDialogShown = false;
    private boolean allowInsecureSsl = false;
    private SwipeRefreshLayout swipeRefreshLayout = null;

    // Hauptseite ohne Netz, siehe OfflineLoadPolicy und docs/offline-modus.md.
    private final Handler mainHandler = new Handler(Looper.getMainLooper());
    /** Die zuletzt am Netz gescheiterte Adresse der Hauptseite, sonst null. */
    private String failedUrl = null;
    /** Ein Netzfehler der Hauptseite seit dem letzten onPageStarted. */
    private boolean mainFrameFailed = false;
    private int probesDone = 0;
    private boolean loadingOverlay = false;
    private boolean overlayVisible = false;
    private boolean firstRetryDone = false;
    private boolean spuriousErrorReported = false;
    private ConnectivityManager.NetworkCallback networkCallback = null;
    private final Runnable probeRunnable = this::probeAfterMainFrameError;
    private final Runnable retryRunnable = this::retryFailedLoad;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        SplashScreen.installSplashScreen(this);

        SharedPreferences prefs = getSharedPreferences("einsatzkarte", MODE_PRIVATE);
        String override = prefs.getString("server_url_override", null);
        allowInsecureSsl = prefs.getBoolean("allow_insecure_ssl", false);

        if (override != null && !override.trim().isEmpty()) {
            String trimmedOverride = override.trim();
            if (ServerUrlValidation.isValidHttpUrl(trimmedOverride)) {
                applyServerUrlOverride(trimmedOverride);
            } else {
                // Ein ungültiger Override lässt Capacitor beim Start abstürzen:
                // initWebView() bricht bei `new URL(invalid)` ab, appUrl bleibt
                // null und loadWebView() ruft Uri.parse(null) -> NPE. Deshalb den
                // ungültigen Wert ignorieren (Standard-URL greift) und löschen,
                // damit sich die App selbst wieder fängt. Der Nutzer kann in den
                // Einstellungen eine korrekte URL eingeben.
                Log.e(TAG, "Ignoring invalid server_url_override: " + trimmedOverride);
                prefs.edit().remove("server_url_override").apply();
            }
        }

        registerPlugin(RadiacodeNotificationPlugin.class);
        registerPlugin(AppPermissionsPlugin.class);

        super.onCreate(savedInstanceState);

        // Force edge-to-edge
        Window window = getWindow();
        WindowCompat.setDecorFitsSystemWindows(window, false);

        WebView webView = this.bridge.getWebView();

        // WebAuthn/Passkeys sind im Android-WebView standardmäßig deaktiviert und
        // müssen explizit freigeschaltet werden, sonst schlägt
        // navigator.credentials.get() im Login fehl. FOR_APP leitet die Anfrage
        // über den Credential Manager der App; die Relying Party sieht dabei
        // weiterhin die Web-Origin (https://einsatz.ffnd.at), weshalb serverseitig
        // nichts zu konfigurieren ist. Voraussetzung ist die Verknüpfung über
        // /.well-known/assetlinks.json mit delegate_permission/common.get_login_creds.
        if (WebViewFeature.isFeatureSupported(WebViewFeature.WEB_AUTHENTICATION)) {
            WebSettingsCompat.setWebAuthenticationSupport(
                webView.getSettings(),
                WebSettingsCompat.WEB_AUTHENTICATION_SUPPORT_FOR_APP
            );
        } else {
            Log.i(TAG, "WebView does not support WebAuthn, passkey login unavailable");
        }

        swipeRefreshLayout = findViewById(R.id.swipe_refresh);
        if (swipeRefreshLayout != null) {
            swipeRefreshLayout.setOnRefreshListener(() -> {
                // Ein reload() lüde nur die Overlay-Seite selbst neu.
                if (overlayVisible && failedUrl != null) {
                    loadFailedUrl();
                } else {
                    webView.reload();
                }
            });
        }

        registerNetworkCallback();

        webView.setWebViewClient(new BridgeWebViewClient(this.bridge) {
            @Override
            public void onPageStarted(WebView view, String url, Bitmap favicon) {
                super.onPageStarted(view, url, favicon);
                errorDialogShown = false;
                mainFrameFailed = false;
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                super.onPageFinished(view, url);
                if (swipeRefreshLayout != null) {
                    swipeRefreshLayout.setRefreshing(false);
                }
                if (loadingOverlay) {
                    loadingOverlay = false;
                    overlayVisible = true;
                } else if (!mainFrameFailed) {
                    onMainFrameLoaded();
                }
            }

            @Override
            public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
                super.onReceivedError(view, request, error);
                if (!request.isForMainFrame()) return;
                int code = error.getErrorCode();
                String url = request.getUrl().toString();
                logToCrashlytics("main frame error " + code + " " + error.getDescription());
                if (OfflineLoadPolicy.isConnectivityError(code, hasValidatedNetwork())) {
                    onMainFrameNetworkError(url);
                } else {
                    showLoadErrorDialog(url, error.getDescription() + " (Code " + code + ")");
                }
            }

            @Override
            public void onReceivedHttpError(WebView view, WebResourceRequest request, WebResourceResponse errorResponse) {
                super.onReceivedHttpError(view, request, errorResponse);
                // Die eingebaute Offline-Seite des Service Workers (503) bietet
                // selbst „Erneut versuchen"; ein Dialog darüber verdeckte sie nur.
                if (request.isForMainFrame()
                    && !OfflineLoadPolicy.isOfflineFallbackResponse(errorResponse.getResponseHeaders())) {
                    showLoadErrorDialog(request.getUrl().toString(), "HTTP " + errorResponse.getStatusCode() + " " + errorResponse.getReasonPhrase());
                }
            }

            @Override
            public void onReceivedSslError(WebView view, SslErrorHandler handler, SslError error) {
                if (allowInsecureSsl) {
                    handler.proceed();
                    return;
                }
                handler.cancel();
                showLoadErrorDialog(error.getUrl(), "SSL: " + describeSslError(error));
            }

            // onRenderProcessGone gibt es erst ab API 26 (Android 8.0). minSdk ist 24,
            // daher zur Sicherheit per SDK_INT-Check absichern, auch wenn der Callback
            // vor API 26 gar nicht aufgerufen werden kann.
            @Override
            @RequiresApi(Build.VERSION_CODES.O)
            public boolean onRenderProcessGone(WebView view, RenderProcessGoneDetail detail) {
                if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
                    return super.onRenderProcessGone(view, detail);
                }
                Log.e(TAG, "WebView renderer process gone, didCrash=" + detail.didCrash());
                try {
                    FirebaseCrashlytics.getInstance().recordException(
                        new RuntimeException("WebView renderer process gone (didCrash=" + detail.didCrash() + ")")
                    );
                } catch (Throwable t) {
                    Log.w(TAG, "Failed to report renderer crash to Crashlytics", t);
                }
                // Android-Vertrag: tote WebView muss aus dem View-Tree entfernt und
                // mit destroy() freigegeben werden, sonst kann ein späterer Zugriff
                // einen IllegalStateException werfen.
                try {
                    android.view.ViewParent parent = view.getParent();
                    if (parent instanceof android.view.ViewGroup) {
                        ((android.view.ViewGroup) parent).removeView(view);
                    }
                    view.destroy();
                } catch (Throwable t) {
                    Log.w(TAG, "Failed to remove/destroy dead WebView", t);
                }
                Log.i(TAG, "Recreating activity after renderer crash");
                recreate();
                return true; // wir haben den Crash behandelt, App nicht killen
            }
        });
    }

    private void applyServerUrlOverride(String overrideUrl) {
        try {
            AssetManager assets = getAssets();
            String json = readAssetText(assets, "capacitor.config.json");
            JSONObject configJson = new JSONObject(json);
            JSONObject server = configJson.optJSONObject("server");
            if (server == null) {
                server = new JSONObject();
                configJson.put("server", server);
            }
            server.put("url", overrideUrl);
            server.put("cleartext", true);
            @SuppressWarnings("deprecation")
            CapConfig overridden = new CapConfig(assets, configJson);
            this.config = overridden;
        } catch (Exception ex) {
            Log.e(TAG, "Failed to apply server.url override " + overrideUrl, ex);
        }
    }

    private static String readAssetText(AssetManager assets, String path) throws java.io.IOException {
        try (InputStream in = assets.open(path)) {
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            byte[] buf = new byte[4096];
            int n;
            while ((n = in.read(buf)) > 0) {
                out.write(buf, 0, n);
            }
            return out.toString("UTF-8");
        }
    }

    /**
     * Netzfehler der Hauptseite. Nicht sofort das Overlay: Beim Kaltstart
     * meldet WebView den Fehler der parallelen Netzanfrage, während der
     * Service Worker die Seite aus dem Cache liefert. Erst nachsehen, was
     * tatsächlich angezeigt wird (OfflineLoadPolicy).
     *
     * Bewusst auch nicht synchron aus onReceivedError heraus eine neue Seite
     * laden: Die konkurrierte mit der Fehlerseite, die Chromium gerade
     * übernimmt, und blieb dabei mitunter auf der Strecke — zurück blieb
     * „Webseite nicht verfügbar" ohne jeden Knopf.
     */
    private void onMainFrameNetworkError(String url) {
        mainFrameFailed = true;
        failedUrl = url;
        probesDone = 0;
        mainHandler.removeCallbacks(probeRunnable);
        mainHandler.postDelayed(probeRunnable, OfflineLoadPolicy.PROBE_DELAY_MS);
    }

    private void probeAfterMainFrameError() {
        if (failedUrl == null || isFinishing()) return;
        WebView webView = bridge.getWebView();
        webView.evaluateJavascript(OfflineLoadPolicy.PROBE_SCRIPT, result -> {
            if (failedUrl == null || isFinishing()) return;
            switch (OfflineLoadPolicy.classifyProbe(result, webView.getProgress(), probesDone)) {
                case PAGE_LOADED:
                    reportSpuriousMainFrameError();
                    onMainFrameLoaded();
                    break;
                case LOADING:
                    probesDone++;
                    mainHandler.postDelayed(probeRunnable, OfflineLoadPolicy.PROBE_INTERVAL_MS);
                    break;
                case ERROR_PAGE:
                    showOfflineOverlay();
                    break;
                case OVERLAY:
                default:
                    break;
            }
        });
    }

    /** Die Hauptseite steht: Overlay und Neuversuche sind erledigt. */
    private void onMainFrameLoaded() {
        failedUrl = null;
        overlayVisible = false;
        firstRetryDone = false;
        probesDone = 0;
        mainHandler.removeCallbacks(probeRunnable);
        mainHandler.removeCallbacks(retryRunnable);
    }

    private void showOfflineOverlay() {
        if (failedUrl == null) return;
        String html = OfflineLoadPolicy.overlayHtml(
            getString(R.string.offline_overlay_title),
            getString(R.string.offline_overlay_message),
            getString(R.string.offline_overlay_retry),
            failedUrl
        );
        loadingOverlay = true;
        bridge.getWebView().loadDataWithBaseURL(failedUrl, html, "text/html", "UTF-8", failedUrl);
        scheduleRetry();
    }

    /**
     * Das Overlay wartet wirklich: ein erster Neuversuch gleich (jetzt mit
     * laufendem Service Worker), danach bei jedem geprüften Netz
     * (registerNetworkCallback) und, falls das Netz steht, der Server aber
     * nicht antwortete, im Takt.
     */
    private void scheduleRetry() {
        mainHandler.removeCallbacks(retryRunnable);
        mainHandler.postDelayed(
            retryRunnable,
            firstRetryDone
                ? OfflineLoadPolicy.VALIDATED_RETRY_INTERVAL_MS
                : OfflineLoadPolicy.FIRST_RETRY_DELAY_MS
        );
    }

    private void retryFailedLoad() {
        if (failedUrl == null || isFinishing()) return;
        if (!overlayVisible && !loadingOverlay) return;
        if (firstRetryDone && !hasValidatedNetwork()) {
            // Ohne Netz kein Versuch im Takt: Jeder Fehlschlag zeigte kurz die
            // Fehlerseite von Chromium. Das Netz meldet sich selbst.
            scheduleRetry();
            return;
        }
        reloadIfNoAppPage();
    }

    /**
     * Automatisches Neuladen nur, wenn keine Seite der App steht. #515 hatte
     * NetworkCallback und Auto-Retry entfernt, weil sie beim Wechsel WLAN/LTE
     * die laufende Seite neu luden: Ein Merker sagte „Overlay", obwohl längst
     * die Karte stand. Deshalb entscheidet hier nicht ein Merker, sondern
     * der Blick ins WebView.
     */
    private void reloadIfNoAppPage() {
        if (failedUrl == null || isFinishing()) return;
        bridge.getWebView().evaluateJavascript(OfflineLoadPolicy.PROBE_SCRIPT, result -> {
            if (failedUrl == null || isFinishing()) return;
            if (OfflineLoadPolicy.mayAutoReload(result)) {
                loadFailedUrl();
            } else {
                onMainFrameLoaded();
            }
        });
    }

    private void loadFailedUrl() {
        if (failedUrl == null) return;
        firstRetryDone = true;
        overlayVisible = false;
        loadingOverlay = false;
        mainHandler.removeCallbacks(retryRunnable);
        bridge.getWebView().loadUrl(failedUrl);
    }

    private void registerNetworkCallback() {
        try {
            ConnectivityManager cm = getSystemService(ConnectivityManager.class);
            if (cm == null) return;
            networkCallback = new ConnectivityManager.NetworkCallback() {
                @Override
                public void onCapabilitiesChanged(Network network, NetworkCapabilities caps) {
                    if (!caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_VALIDATED)) return;
                    mainHandler.post(() -> {
                        if (overlayVisible && failedUrl != null && !isFinishing()) {
                            reloadIfNoAppPage();
                        }
                    });
                }
            };
            cm.registerDefaultNetworkCallback(networkCallback);
        } catch (RuntimeException ex) {
            // Ohne Rückmeldung bleibt der Takt und der Knopf im Overlay.
            networkCallback = null;
            Log.w(TAG, "Network callback not registered", ex);
        }
    }

    private boolean hasValidatedNetwork() {
        try {
            ConnectivityManager cm = getSystemService(ConnectivityManager.class);
            if (cm == null) return false;
            Network network = cm.getActiveNetwork();
            if (network == null) return false;
            NetworkCapabilities caps = cm.getNetworkCapabilities(network);
            return caps != null && caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_VALIDATED);
        } catch (RuntimeException ex) {
            return false;
        }
    }

    /**
     * Einmal je Prozess: Fehler der Hauptseite, obwohl eine Seite der App
     * steht. Belegt im Feld, dass der Fehler von der parallelen Netzanfrage
     * beim Start des Service Workers kommt (OfflineLoadPolicy).
     */
    private void reportSpuriousMainFrameError() {
        if (spuriousErrorReported) return;
        spuriousErrorReported = true;
        try {
            FirebaseCrashlytics.getInstance().recordException(
                new RuntimeException("main frame error although the page loaded (service worker)")
            );
        } catch (Throwable t) {
            Log.w(TAG, "Failed to report spurious main frame error", t);
        }
    }

    private static void logToCrashlytics(String message) {
        try {
            FirebaseCrashlytics.getInstance().log(message);
        } catch (Throwable t) {
            Log.w(TAG, "Crashlytics log failed", t);
        }
    }

    @Override
    public void onDestroy() {
        mainHandler.removeCallbacksAndMessages(null);
        if (networkCallback != null) {
            try {
                ConnectivityManager cm = getSystemService(ConnectivityManager.class);
                if (cm != null) cm.unregisterNetworkCallback(networkCallback);
            } catch (RuntimeException ex) {
                Log.w(TAG, "Network callback not unregistered", ex);
            }
            networkCallback = null;
        }
        super.onDestroy();
    }

    private void showLoadErrorDialog(String url, String details) {
        if (errorDialogShown || isFinishing()) return;
        errorDialogShown = true;
        runOnUiThread(() -> new AlertDialog.Builder(this)
            .setTitle(R.string.load_error_title)
            .setMessage(getString(R.string.load_error_message, url, details))
            .setCancelable(false)
            .setPositiveButton(R.string.load_error_change_url, (DialogInterface d, int w) -> {
                startActivity(new Intent(this, SettingsActivity.class));
            })
            .setNegativeButton(R.string.load_error_retry, (DialogInterface d, int w) -> {
                errorDialogShown = false;
                bridge.getWebView().reload();
            })
            .setNeutralButton(R.string.load_error_dismiss, null)
            .show());
    }

    private static String describeSslError(SslError error) {
        switch (error.getPrimaryError()) {
            case SslError.SSL_UNTRUSTED: return "Zertifikat nicht vertrauenswürdig";
            case SslError.SSL_EXPIRED: return "Zertifikat abgelaufen";
            case SslError.SSL_IDMISMATCH: return "Hostname stimmt nicht mit Zertifikat überein";
            case SslError.SSL_NOTYETVALID: return "Zertifikat noch nicht gültig";
            case SslError.SSL_DATE_INVALID: return "Ungültiges Zertifikatsdatum";
            case SslError.SSL_INVALID: return "Ungültiges Zertifikat";
            default: return error.toString();
        }
    }

    @Override
    public void onBackPressed() {
        Log.i(TAG, "onBackPressed — stopping service and exiting app");
        try {
            Intent stopIntent = new Intent(this, RadiacodeForegroundService.class);
            stopService(stopIntent);
        } catch (Exception e) {
            Log.e(TAG, "Failed to stop service", e);
        }
        finishAndRemoveTask();
        // Force process exit after a short delay to ensure clean state on next start
        new Handler(Looper.getMainLooper()).postDelayed(() -> System.exit(0), 150);
    }
}
