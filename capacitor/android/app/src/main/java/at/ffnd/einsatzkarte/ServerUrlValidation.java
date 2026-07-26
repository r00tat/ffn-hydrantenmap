package at.ffnd.einsatzkarte;

import java.net.URL;

/**
 * Validierung der optionalen server.url-Override-Eingabe.
 *
 * <p>Capacitor parst die Server-URL in {@code Bridge.initWebView()} mit
 * {@code new java.net.URL(...)}. Schlägt das fehl, bricht die Methode ab,
 * {@code appUrl} bleibt {@code null} und {@code loadWebView()} ruft
 * {@code Uri.parse(null)} auf → {@link NullPointerException} beim App-Start
 * ohne Recovery. Ein ungültiger Override darf daher niemals angewendet werden.
 *
 * <p>Bewusst frei von Android-Abhängigkeiten, damit die Logik als reiner
 * JVM-Unit-Test prüfbar ist.
 */
public final class ServerUrlValidation {

    private ServerUrlValidation() {}

    /**
     * @return {@code true}, wenn {@code value} eine gültige, von Capacitor
     *     parsebare http(s)-URL mit Host ist.
     */
    public static boolean isValidHttpUrl(String value) {
        if (value == null || value.trim().isEmpty()) {
            return false;
        }
        try {
            URL url = new URL(value.trim());
            String protocol = url.getProtocol();
            String authority = url.getAuthority();
            return ("http".equals(protocol) || "https".equals(protocol))
                && authority != null
                && !authority.isEmpty();
        } catch (Exception ex) {
            return false;
        }
    }
}
