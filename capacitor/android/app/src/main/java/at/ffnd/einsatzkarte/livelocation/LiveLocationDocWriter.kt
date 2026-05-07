package at.ffnd.einsatzkarte.livelocation

import android.util.Log
import com.google.firebase.Timestamp
import com.google.firebase.firestore.FieldValue
import com.google.firebase.firestore.FirebaseFirestore
import com.google.firebase.firestore.SetOptions
import java.util.Date

/**
 * Identity + invariant fields for a Live-Location entry. uid, name, email
 * stay constant for the lifetime of the pusher; lat/lng/accuracy/heading/speed
 * change on every GPS sample.
 */
data class LiveLocationConfig(
    val firecallId: String,
    val uid: String,
    val name: String,
    val email: String,
)

/**
 * Single GPS sample to push. Optional fields stay null when the platform
 * does not provide them (e.g. heading/speed during a GPS standstill).
 */
data class LiveLocationSample(
    val lat: Double,
    val lng: Double,
    val accuracy: Double?,
    val heading: Double?,
    val speed: Double?,
)

interface LiveLocationDocSink {
    fun writeSample(
        config: LiveLocationConfig,
        sample: LiveLocationSample,
        onSuccess: () -> Unit = {},
        onFailure: (Throwable) -> Unit = {},
    )

    fun deleteDoc(
        config: LiveLocationConfig,
        onSuccess: () -> Unit = {},
        onFailure: (Throwable) -> Unit = {},
    )
}

/**
 * Schreibt das `call/{firecallId}/livelocation/{uid}`-Dokument für den
 * eingeloggten Nutzer. Schemafelder müssen mit der TS-Seite übereinstimmen:
 *
 *  - `uid`, `name`, `email` (string)
 *  - `lat`, `lng` (double)
 *  - `accuracy`, `heading`, `speed` (optional, double — null wird ausgelassen)
 *  - `updatedAt` = Server-Timestamp (FieldValue.serverTimestamp())
 *  - `expiresAt` = `Timestamp` von `now + TTL_HOURS` für Firestore-TTL-Cleanup
 *
 * Pro Aufruf wird `set(merge=true)` verwendet, sodass eine einzige
 * Schreiboperation reicht und das Dokument auch dann angelegt wird, wenn
 * es noch nicht existiert.
 */
class FirestoreLiveLocationDocWriter(dbName: String) : LiveLocationDocSink {

    companion object {
        private const val TAG = "LiveLocation"
        private const val TTL_MS = 60L * 60L * 1000L
    }

    private val firestore: FirebaseFirestore = (
        if (dbName.isBlank()) FirebaseFirestore.getInstance()
        else FirebaseFirestore.getInstance(dbName)
    ).also {
        Log.i(TAG, "Firestore DB = ${if (dbName.isBlank()) "(default)" else dbName}")
    }

    override fun writeSample(
        config: LiveLocationConfig,
        sample: LiveLocationSample,
        onSuccess: () -> Unit,
        onFailure: (Throwable) -> Unit,
    ) {
        val data = linkedMapOf<String, Any>(
            "uid" to config.uid,
            "name" to config.name,
            "email" to config.email,
            "lat" to sample.lat,
            "lng" to sample.lng,
            "updatedAt" to FieldValue.serverTimestamp(),
            "expiresAt" to Timestamp(Date(System.currentTimeMillis() + TTL_MS)),
        )
        sample.accuracy?.let { data["accuracy"] = it }
        sample.heading?.let { data["heading"] = it }
        sample.speed?.let { data["speed"] = it }

        docRef(config).set(data, SetOptions.merge())
            .addOnSuccessListener { onSuccess() }
            .addOnFailureListener { err ->
                Log.w(TAG, "live-location write failed", err); onFailure(err)
            }
    }

    override fun deleteDoc(
        config: LiveLocationConfig,
        onSuccess: () -> Unit,
        onFailure: (Throwable) -> Unit,
    ) {
        docRef(config).delete()
            .addOnSuccessListener { onSuccess() }
            .addOnFailureListener { err ->
                Log.w(TAG, "live-location delete failed", err); onFailure(err)
            }
    }

    private fun docRef(config: LiveLocationConfig) =
        firestore.collection("call").document(config.firecallId)
            .collection("livelocation").document(config.uid)
}
