package at.ffnd.einsatzkarte;

import com.google.firebase.appcheck.AppCheckProviderFactory;
import com.google.firebase.appcheck.playintegrity.PlayIntegrityAppCheckProviderFactory;

/**
 * App-Check-Provider für Release-Builds.
 *
 * Play Integrity attestiert, dass die App eine unveränderte, über Google Play
 * ausgelieferte Installation auf einem echten Gerät ist. Voraussetzung ist, dass
 * die App in der Play Console mit dem Firebase-Projekt verknüpft ist — ohne
 * diese Verknüpfung liefert Play Integrity keine verwertbaren Tokens.
 *
 * Die Debug-Variante dieser Klasse liegt in app/src/debug/java und liefert
 * stattdessen den Debug-Provider.
 */
final class AppCheckProviders {
    private AppCheckProviders() {}

    static AppCheckProviderFactory create() {
        return PlayIntegrityAppCheckProviderFactory.getInstance();
    }

    static String describe() {
        return "play-integrity";
    }
}
