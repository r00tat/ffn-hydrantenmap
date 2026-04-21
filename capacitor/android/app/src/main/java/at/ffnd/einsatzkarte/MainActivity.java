package at.ffnd.einsatzkarte;

import android.app.AlertDialog;
import android.content.DialogInterface;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.res.AssetManager;
import android.graphics.Bitmap;
import android.net.ConnectivityManager;
import android.net.Network;
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
    private String lastRequestedUrl = null;
    private ConnectivityManager.NetworkCallback networkCallback = null;
    private final Handler retryHandler = new Handler(Looper.getMainLooper());
    private static final Set<Integer> TRANSIENT_ERRORS = new HashSet<>();
    static {
        TRANSIENT_ERRORS.add(WebViewClient.ERROR_CONNECT);
        TRANSIENT_ERRORS.add(WebViewClient.ERROR_HOST_LOOKUP);
        TRANSIENT_ERRORS.add(WebViewClient.ERROR_TIMEOUT);
        TRANSIENT_ERRORS.add(WebViewClient.ERROR_IO);
        TRANSIENT_ERRORS.add(WebViewClient.ERROR_PROXY_AUTHENTICATION);
    }

    @Override
    public void onCreate(Bundle savedInstanceState) {
        SharedPreferences prefs = getSharedPreferences("einsatzkarte", MODE_PRIVATE);
        String override = prefs.getString("server_url_override", null);
        allowInsecureSsl = prefs.getBoolean("allow_insecure_ssl", false);

        // When a dev server URL is set via SettingsActivity, rewrite the
        // CapConfig before Bridge init so Capacitor registers the
        // document-start plugin script + URI matchers for that origin.
        // Without this, modern WebViews (API 24+ with DOCUMENT_START_SCRIPT)
        // only inject plugin headers for the baked-in server.url and every
        // native plugin call from the override origin fails with
        // "plugin is not implemented on android".
        if (override != null && !override.trim().isEmpty()) {
            applyServerUrlOverride(override.trim());
        }

        super.onCreate(savedInstanceState);

        WebView webView = this.bridge.getWebView();
        webView.setWebViewClient(new BridgeWebViewClient(this.bridge) {
            @Override
            public void onPageStarted(WebView view, String url, Bitmap favicon) {
                super.onPageStarted(view, url, favicon);
                errorDialogShown = false;
                if (url != null && !"about:blank".equals(url)) {
                    lastRequestedUrl = url;
                    offlineOverlayShown = false;
                }
            }

            @Override
            public void onReceivedError(
                WebView view,
                WebResourceRequest request,
                WebResourceError error
            ) {
                super.onReceivedError(view, request, error);
                if (!request.isForMainFrame()) return;
                int code = error.getErrorCode();
                String url = request.getUrl().toString();
                if (TRANSIENT_ERRORS.contains(code)) {
                    showOfflineOverlay(url);
                } else {
                    showLoadErrorDialog(
                        url,
                        error.getDescription() + " (Code " + code + ")"
                    );
                }
            }

            @Override
            public void onReceivedHttpError(
                WebView view,
                WebResourceRequest request,
                WebResourceResponse errorResponse
            ) {
                super.onReceivedHttpError(view, request, errorResponse);
                if (request.isForMainFrame()) {
                    showLoadErrorDialog(
                        request.getUrl().toString(),
                        "HTTP " + errorResponse.getStatusCode() + " " + errorResponse.getReasonPhrase()
                    );
                }
            }

            @Override
            public void onReceivedSslError(
                WebView view,
                SslErrorHandler handler,
                SslError error
            ) {
                if (allowInsecureSsl) {
                    handler.proceed();
                    return;
                }
                handler.cancel();
                showLoadErrorDialog(error.getUrl(), "SSL: " + describeSslError(error));
            }
        });

        ConnectivityManager cm = (ConnectivityManager) getSystemService(CONNECTIVITY_SERVICE);
        if (cm != null) {
            networkCallback = new ConnectivityManager.NetworkCallback() {
                @Override
                public void onAvailable(Network network) {
                    if (offlineOverlayShown) {
                        runOnUiThread(() -> {
                            offlineOverlayShown = false;
                            retryHandler.removeCallbacksAndMessages(null);
                            if (lastRequestedUrl != null) {
                                bridge.getWebView().loadUrl(lastRequestedUrl);
                            } else {
                                bridge.getWebView().reload();
                            }
                        });
                    }
                }
            };
            cm.registerDefaultNetworkCallback(networkCallback);
        }
    }

    @Override
    public void onDestroy() {
        if (networkCallback != null) {
            ConnectivityManager cm = (ConnectivityManager) getSystemService(CONNECTIVITY_SERVICE);
            if (cm != null) {
                try {
                    cm.unregisterNetworkCallback(networkCallback);
                } catch (IllegalArgumentException ignored) {
                    // already unregistered
                }
            }
            networkCallback = null;
        }
        retryHandler.removeCallbacksAndMessages(null);
        super.onDestroy();
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
            // CapConfig(AssetManager, JSONObject) is @Deprecated but still
            // the only supported way to hand in a pre-built JSON config.
            @SuppressWarnings("deprecation")
            CapConfig overridden = new CapConfig(assets, configJson);
            this.config = overridden;
            Log.i(TAG, "Applied server.url override: " + overrideUrl);
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
        lastRequestedUrl = url;
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
        retryHandler.removeCallbacksAndMessages(null);
        retryHandler.postDelayed(() -> {
            if (offlineOverlayShown) {
                offlineOverlayShown = false;
                bridge.getWebView().loadUrl(url);
            }
        }, 5000);
        runOnUiThread(() -> {
            bridge.getWebView().loadDataWithBaseURL(
                url, html, "text/html", "UTF-8", url
            );
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
}
