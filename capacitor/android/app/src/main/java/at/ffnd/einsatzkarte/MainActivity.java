package at.ffnd.einsatzkarte;

import android.app.AlertDialog;
import android.content.DialogInterface;
import android.content.Intent;
import android.content.SharedPreferences;
import android.graphics.Bitmap;
import android.net.http.SslError;
import android.os.Bundle;
import android.webkit.SslErrorHandler;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebView;

import com.getcapacitor.BridgeActivity;
import com.getcapacitor.BridgeWebViewClient;

public class MainActivity extends BridgeActivity {
    private boolean errorDialogShown = false;
    private boolean allowInsecureSsl = false;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        SharedPreferences prefs = getSharedPreferences("einsatzkarte", MODE_PRIVATE);
        String override = prefs.getString("server_url_override", null);
        allowInsecureSsl = prefs.getBoolean("allow_insecure_ssl", false);

        WebView webView = this.bridge.getWebView();
        webView.setWebViewClient(new BridgeWebViewClient(this.bridge) {
            @Override
            public void onPageStarted(WebView view, String url, Bitmap favicon) {
                super.onPageStarted(view, url, favicon);
                errorDialogShown = false;
            }

            @Override
            public void onReceivedError(
                WebView view,
                WebResourceRequest request,
                WebResourceError error
            ) {
                super.onReceivedError(view, request, error);
                if (request.isForMainFrame()) {
                    showLoadErrorDialog(
                        request.getUrl().toString(),
                        error.getDescription() + " (Code " + error.getErrorCode() + ")"
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

        if (override != null && !override.trim().isEmpty()) {
            webView.loadUrl(override.trim());
        }
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
