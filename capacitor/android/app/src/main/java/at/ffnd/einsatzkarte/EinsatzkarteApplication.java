package at.ffnd.einsatzkarte;

import android.app.Application;
import android.util.Log;

import com.google.firebase.FirebaseApp;
import com.google.firebase.appcheck.FirebaseAppCheck;

/**
 * Application-Einstiegspunkt, der App Check installiert.
 *
 * Das muss hier passieren und nicht in der MainActivity: die nativen
 * Firestore-Schreibpfade (LiveLocationDocWriter, FirestoreLineUpdater,
 * FirestoreMarkerWriter) laufen aus Services heraus. Wird der Prozess über einen
 * Service gestartet, gibt es keine MainActivity, die den Provider setzen könnte —
 * die Writes gingen dann ohne App-Check-Token raus.
 *
 * Application.onCreate() läuft nach dem FirebaseInitProvider, Firebase ist also
 * bereits initialisiert. installAppCheckProviderFactory muss vor dem ersten
 * Firebase-Aufruf erfolgen, was hier gegeben ist.
 */
public class EinsatzkarteApplication extends Application {
    private static final String TAG = "EinsatzkarteApp";

    @Override
    public void onCreate() {
        super.onCreate();
        installAppCheck();
    }

    /**
     * Ein Fehler beim Installieren des Providers darf die App nicht am Start
     * hindern: solange Enforcement aus ist, bedeutet ein fehlender Provider nur
     * unverifizierte Requests, und auch danach gaten die Firestore-Rules weiter
     * jeden Zugriff. Ein Absturz hier wäre der deutlich schlechtere Tausch.
     */
    private void installAppCheck() {
        try {
            // Safety net: normalerweise hat der FirebaseInitProvider das schon
            // erledigt. Ein zweiter Aufruf liefert die bestehende Instanz.
            FirebaseApp.initializeApp(this);

            FirebaseAppCheck.getInstance()
                .installAppCheckProviderFactory(AppCheckProviders.create());
            Log.i(TAG, "App Check provider installed: " + AppCheckProviders.describe());
        } catch (Throwable t) {
            Log.e(TAG, "Failed to install App Check provider", t);
        }
    }
}
