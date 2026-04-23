package at.ffnd.einsatzkarte;

import android.app.AlertDialog;
import android.content.DialogInterface;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.res.AssetManager;
import android.graphics.Bitmap;
import android.net.http.SslError;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.util.Log;
import android.webkit.SslErrorHandler;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.view.Window;

import androidx.swiperefreshlayout.widget.SwipeRefreshLayout;
import androidx.core.splashscreen.SplashScreen;
import androidx.core.view.WindowCompat;

import com.getcapacitor.BridgeActivity;
import com.getcapacitor.BridgeWebViewClient;
import com.getcapacitor.CapConfig;

import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.util.HashSet;
import java.util.Set;

public class MainActivity extends BridgeActivity {
    private static final String TAG = "MainActivity";
    private boolean errorDialogShown = false;
    private boolean allowInsecureSsl = false;
    private boolean offlineOverlayShown = false;
    private static final Set<Integer> TRANSIENT_ERRORS = new HashSet<>();
    static {
        TRANSIENT_ERRORS.add(WebViewClient.ERROR_CONNECT);
        TRANSIENT_ERRORS.add(WebViewClient.ERROR_HOST_LOOKUP);
        TRANSIENT_ERRORS.add(WebViewClient.ERROR_TIMEOUT);
        TRANSIENT_ERRORS.add(WebViewClient.ERROR_IO);
        TRANSIENT_ERRORS.add(WebViewClient.ERROR_PROXY_AUTHENTICATION);
    }
    private SwipeRefreshLayout swipeRefreshLayout = null;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        SplashScreen.installSplashScreen(this);

        SharedPreferences prefs = getSharedPreferences("einsatzkarte", MODE_PRIVATE);
        String override = prefs.getString("server_url_override", null);
        allowInsecureSsl = prefs.getBoolean("allow_insecure_ssl", false);

        if (override != null && !override.trim().isEmpty()) {
            applyServerUrlOverride(override.trim());
        }

        registerPlugin(RadiacodeNotificationPlugin.class);

        super.onCreate(savedInstanceState);

        // Force edge-to-edge
        Window window = getWindow();
        WindowCompat.setDecorFitsSystemWindows(window, false);

        WebView webView = this.bridge.getWebView();

        swipeRefreshLayout = findViewById(R.id.swipe_refresh);
        if (swipeRefreshLayout != null) {
            swipeRefreshLayout.setOnRefreshListener(() -> webView.reload());
        }

        webView.setWebViewClient(new BridgeWebViewClient(this.bridge) {
            @Override
            public void onPageStarted(WebView view, String url, Bitmap favicon) {
                super.onPageStarted(view, url, favicon);
                errorDialogShown = false;
                if (url != null && !"about:blank".equals(url)) {
                    offlineOverlayShown = false;
                }
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                super.onPageFinished(view, url);
                if (swipeRefreshLayout != null) {
                    swipeRefreshLayout.setRefreshing(false);
                }
            }

            @Override
            public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
                super.onReceivedError(view, request, error);
                if (!request.isForMainFrame()) return;
                int code = error.getErrorCode();
                String url = request.getUrl().toString();
                if (TRANSIENT_ERRORS.contains(code)) {
                    showOfflineOverlay(url);
                } else {
                    showLoadErrorDialog(url, error.getDescription() + " (Code " + code + ")");
                }
            }

            @Override
            public void onReceivedHttpError(WebView view, WebResourceRequest request, WebResourceResponse errorResponse) {
                super.onReceivedHttpError(view, request, errorResponse);
                if (request.isForMainFrame()) {
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

    private void showOfflineOverlay(String url) {
        if (offlineOverlayShown) return;
        offlineOverlayShown = true;
        String html = "<!DOCTYPE html><html><head><meta charset=\"utf-8\">"
            + "<meta name=\"viewport\" content=\"width=device-width,initial-scale=1\">"
            + "<style>body{font-family:system-ui,-apple-system,sans-serif;"
            + "background:#111;color:#eee;display:flex;flex-direction:column;"
            + "align-items:center;justify-content:center;height:100vh;margin:0;"
            + "padding:16px;text-align:center}"
            + "h1{font-size:20px;margin:0 0 8px}"
            + "p{margin:0 0 24px;opacity:.8}"
            + "button{background:#d32f2f;color:#fff;border:0;border-radius:8px;"
            + "padding:12px 24px;font-size:16px}</style></head><body>"
            + "<h1>" + getString(R.string.offline_overlay_title) + "</h1>"
            + "<p>" + getString(R.string.offline_overlay_message) + "</p>"
            + "<button onclick=\"window.location.reload()\">"
            + getString(R.string.offline_overlay_retry) + "</button></body></html>";
        runOnUiThread(() -> {
            bridge.getWebView().loadDataWithBaseURL(url, html, "text/html", "UTF-8", url);
        });
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
