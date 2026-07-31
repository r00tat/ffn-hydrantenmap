package at.ffnd.einsatzkarte;

import com.google.firebase.appcheck.AppCheckProviderFactory;
import com.google.firebase.appcheck.debug.DebugAppCheckProviderFactory;

/**
 * App-Check-Provider für Debug-Builds.
 *
 * Play Integrity funktioniert nur für Installationen aus dem Play Store, ein
 * lokal per Gradle installierter Debug-Build bekommt dort keine Tokens. Der
 * Debug-Provider loggt beim ersten Start ein Debug-Token nach Logcat:
 *
 *   adb logcat -s DebugAppCheckProvider
 *
 * Dieses Token muss einmalig in der Firebase Console unter
 * App Check → Apps → at.ffnd.einsatzkarte → Debug-Tokens registriert werden.
 * Es ist pro Installation neu, ein Neuinstallieren erzeugt also ein neues Token.
 *
 * Die Release-Variante dieser Klasse liegt in app/src/release/java.
 */
final class AppCheckProviders {
    private AppCheckProviders() {}

    static AppCheckProviderFactory create() {
        return DebugAppCheckProviderFactory.getInstance();
    }

    static String describe() {
        return "debug";
    }
}
