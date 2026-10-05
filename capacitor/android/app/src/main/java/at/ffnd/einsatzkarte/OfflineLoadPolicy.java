package at.ffnd.einsatzkarte;

import android.webkit.WebViewClient;

import java.util.Map;

/**
 * Entscheidungen der {@link MainActivity}, wenn die Hauptseite nicht lädt.
 *
 * <p>Ein {@code onReceivedError} für die Hauptseite heißt in der App nicht
 * zwingend, dass nichts angezeigt wird. Läuft der Service Worker beim
 * Kaltstart noch nicht, schickt Chromium die Netzanfrage für die Navigation
 * parallel zu seinem Start ab (ServiceWorkerAutoPreload). Offline scheitert
 * sie, WebView meldet den Fehler — und der Service Worker liefert die Seite
 * trotzdem aus seinem Cache. Früher ersetzte das Overlay daraufhin genau diese
 * Seite, und erst „Erneut versuchen" (dann mit laufendem Worker, also ohne
 * parallele Anfrage) brachte sie zurück. Deshalb wird vor dem Overlay
 * nachgesehen, was tatsächlich im WebView steht ({@link #PROBE_SCRIPT}).
 *
 * <p>Die Konstanten aus {@link WebViewClient} sind Compile-Zeit-Konstanten;
 * die Klasse ist damit als reiner JVM-Unit-Test prüfbar, wie
 * {@link ServerUrlValidation}.
 */
public final class OfflineLoadPolicy {

    private OfflineLoadPolicy() {}

    /** Wartezeit bis zum ersten Blick auf die Seite nach dem Fehler. */
    public static final long PROBE_DELAY_MS = 1500;
    /** Abstand weiterer Blicke, solange die Navigation noch läuft. */
    public static final long PROBE_INTERVAL_MS = 1000;
    /** So oft wird höchstens nachgesehen, bevor das Overlay kommt. */
    public static final int MAX_PROBES = 10;
    /**
     * Erster Neuversuch aus dem Overlay, ohne auf das Netz zu warten. Genau das
     * tat bisher der Knopf von Hand — nun mit laufendem Service Worker, der die
     * Seite aus dem Cache liefern kann.
     */
    public static final long FIRST_RETRY_DELAY_MS = 2000;
    /**
     * Neuversuch bei bestehendem Netz, falls der Server selbst nicht
     * antwortete. Ohne Netz wird nicht im Takt versucht: Jeder Fehlschlag zeigte
     * kurz die Fehlerseite von Chromium.
     */
    public static final long VALIDATED_RETRY_INTERVAL_MS = 30_000;

    /** Kennung der Overlay-Seite, gesetzt in {@link #overlayHtml}. */
    public static final String OVERLAY_MARKER = "__ffndOfflineOverlay";

    /**
     * Kennzeichen der eingebauten Offline-Seite des Service Workers
     * ({@code OFFLINE_FALLBACK_HEADER} in {@code src/worker/appShell.ts}).
     */
    public static final String OFFLINE_FALLBACK_HEADER = "X-Einsatzkarte-Offline-Fallback";

    /**
     * Was im WebView steht: das Overlay, eine Seite der App (Next.js-Skripte
     * oder die eingebaute Offline-Seite des Workers) oder etwas anderes samt
     * Adresse — die Fehlerseite von Chromium oder das leere Dokument vor dem
     * ersten Commit.
     */
    public static final String PROBE_SCRIPT =
        "(function(){try{"
            + "if(window." + OVERLAY_MARKER + ")return 'overlay';"
            + "if(document.querySelector('script[src*=\"/_next/\"],meta[name=\"einsatzkarte-offline\"]'))return 'app';"
            + "return 'other:'+location.href;"
            + "}catch(e){return 'error';}})()";

    public enum ProbeOutcome {
        /** Eine Seite der App ist da, der Fehler war die parallele Netzanfrage. */
        PAGE_LOADED,
        /** Das Overlay steht schon. */
        OVERLAY,
        /** Die Navigation läuft noch, später erneut nachsehen. */
        LOADING,
        /** Nichts Brauchbares: Overlay zeigen. */
        ERROR_PAGE,
    }

    /**
     * Ob ein Fehler der Hauptseite als fehlende Verbindung gilt und das
     * Overlay bekommt, statt des Dialogs mit „URL ändern".
     *
     * <p>{@code ERR_INTERNET_DISCONNECTED} wird in WebView zu
     * {@code ERROR_HOST_LOOKUP}; {@code ERR_FAILED}, {@code ERR_NETWORK_CHANGED}
     * und ähnliche landen bei {@code ERROR_UNKNOWN}. Letzteres zählt nur ohne
     * geprüftes Netz als Funkloch.
     */
    public static boolean isConnectivityError(int errorCode, boolean hasValidatedNetwork) {
        switch (errorCode) {
            case WebViewClient.ERROR_CONNECT:
            case WebViewClient.ERROR_HOST_LOOKUP:
            case WebViewClient.ERROR_TIMEOUT:
            case WebViewClient.ERROR_IO:
            case WebViewClient.ERROR_PROXY_AUTHENTICATION:
            case WebViewClient.ERROR_TOO_MANY_REQUESTS:
                return true;
            case WebViewClient.ERROR_UNKNOWN:
                return !hasValidatedNetwork;
            default:
                return false;
        }
    }

    /**
     * Wertet das Ergebnis von {@link #PROBE_SCRIPT} aus.
     *
     * @param jsResult Rückgabe von {@code evaluateJavascript}: ein
     *     JSON-String oder {@code "null"}
     * @param progress {@code WebView.getProgress()}
     * @param probesDone bisherige Blicke für diesen Fehler
     */
    public static ProbeOutcome classifyProbe(String jsResult, int progress, int probesDone) {
        String value = decodeJsString(jsResult);
        if ("overlay".equals(value)) return ProbeOutcome.OVERLAY;
        if ("app".equals(value)) return ProbeOutcome.PAGE_LOADED;
        if (progress < 100 && probesDone < MAX_PROBES) return ProbeOutcome.LOADING;
        return ProbeOutcome.ERROR_PAGE;
    }

    /**
     * Ob ein automatischer Neuversuch (Takt oder Netzrückmeldung) laden darf:
     * nie, wenn eine Seite der App steht — deren Zustand ginge verloren.
     * Overlay, Fehlerseite von Chromium oder ein nicht auswertbares Ergebnis
     * dürfen ersetzt werden.
     */
    public static boolean mayAutoReload(String jsResult) {
        return !"app".equals(decodeJsString(jsResult));
    }

    /** Ob die Antwort die eingebaute Offline-Seite des Service Workers ist. */
    public static boolean isOfflineFallbackResponse(Map<String, String> headers) {
        if (headers == null) return false;
        for (Map.Entry<String, String> header : headers.entrySet()) {
            if (OFFLINE_FALLBACK_HEADER.equalsIgnoreCase(header.getKey())) {
                return "1".equals(header.getValue());
            }
        }
        return false;
    }

    /**
     * Die Overlay-Seite. „Erneut versuchen" navigiert auf die gescheiterte
     * Adresse; ein {@code location.reload()} lüde nur die Overlay-Seite selbst
     * neu, die per {@code loadDataWithBaseURL} kam.
     */
    public static String overlayHtml(String title, String message, String retryLabel, String url) {
        return "<!DOCTYPE html><html><head><meta charset=\"utf-8\">"
            + "<meta name=\"viewport\" content=\"width=device-width,initial-scale=1\">"
            + "<style>body{font-family:system-ui,-apple-system,sans-serif;"
            + "background:#111;color:#eee;display:flex;flex-direction:column;"
            + "align-items:center;justify-content:center;height:100vh;margin:0;"
            + "padding:16px;box-sizing:border-box;text-align:center}"
            + "h1{font-size:20px;margin:0 0 8px}"
            + "p{margin:0 0 24px;opacity:.8}"
            + "button{background:#d32f2f;color:#fff;border:0;border-radius:8px;"
            + "padding:12px 24px;font-size:16px}</style>"
            + "<script>window." + OVERLAY_MARKER + "=true;"
            + "function retry(){location.replace(" + jsString(url) + ")}</script>"
            + "</head><body>"
            + "<h1>" + escapeHtml(title) + "</h1>"
            + "<p>" + escapeHtml(message) + "</p>"
            + "<button onclick=\"retry()\">" + escapeHtml(retryLabel) + "</button>"
            + "</body></html>";
    }

    static String decodeJsString(String jsResult) {
        if (jsResult == null) return null;
        String s = jsResult.trim();
        if (s.length() < 2 || s.charAt(0) != '"' || s.charAt(s.length() - 1) != '"') {
            return null;
        }
        s = s.substring(1, s.length() - 1);
        StringBuilder out = new StringBuilder(s.length());
        for (int i = 0; i < s.length(); i++) {
            char c = s.charAt(i);
            if (c == '\\' && i + 1 < s.length()) {
                char next = s.charAt(++i);
                if (next == 'u' && i + 4 < s.length()) {
                    try {
                        out.append((char) Integer.parseInt(s.substring(i + 1, i + 5), 16));
                        i += 4;
                        continue;
                    } catch (NumberFormatException ignored) {
                        // als Text übernehmen
                    }
                }
                out.append(next);
            } else {
                out.append(c);
            }
        }
        return out.toString();
    }

    /** JavaScript-String-Literal; {@code <} und {@code >} maskiert gegen {@code </script>}. */
    static String jsString(String value) {
        StringBuilder out = new StringBuilder("\"");
        for (int i = 0; i < value.length(); i++) {
            char c = value.charAt(i);
            switch (c) {
                case '"': out.append("\\\""); break;
                case '\\': out.append("\\\\"); break;
                case '<': out.append("\\u003c"); break;
                case '>': out.append("\\u003e"); break;
                case '&': out.append("\\u0026"); break;
                case '\n': out.append("\\n"); break;
                case '\r': out.append("\\r"); break;
                default:
                    if (c < 0x20 || c == ' ' || c == ' ') {
                        out.append(String.format("\\u%04x", (int) c));
                    } else {
                        out.append(c);
                    }
            }
        }
        return out.append('"').toString();
    }

    static String escapeHtml(String value) {
        if (value == null) return "";
        return value
            .replace("&", "&amp;")
            .replace("<", "&lt;")
            .replace(">", "&gt;")
            .replace("\"", "&quot;")
            .replace("'", "&#39;");
    }
}
