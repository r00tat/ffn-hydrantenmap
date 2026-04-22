package at.ffnd.einsatzkarte.radiacode.track

import android.util.Log
import at.ffnd.einsatzkarte.radiacode.Measurement
import com.google.firebase.firestore.FirebaseFirestore
import java.time.Instant
import java.util.Locale

class FirestoreMarkerWriter(dbName: String) : MarkerWriter {
    companion object { private const val TAG = "RadiacodeTrack" }

    private val firestore: FirebaseFirestore = if (dbName.isBlank()) {
        FirebaseFirestore.getInstance()
    } else {
        FirebaseFirestore.getInstance(dbName)
    }.also { Log.i(TAG, "Firestore DB = ${if (dbName.isBlank()) "(default)" else dbName}") }

    override fun write(
        config: TrackConfig,
        measurement: Measurement,
        lat: Double,
        lng: Double,
        onSuccess: (MarkerWriteResult) -> Unit,
        onFailure: (Throwable) -> Unit,
    ) {
        val nowIso = Instant.now().toString()
        val data = linkedMapOf<String, Any>(
            "type" to "marker",
            "name" to String.format(Locale.US, "%.3f µSv/h", measurement.dosisleistungUSvH),
            "layer" to config.layerId,
            "lat" to lat,
            "lng" to lng,
            "fieldData" to mapOf(
                "dosisleistung" to measurement.dosisleistungUSvH,
                "cps" to measurement.cps,
                "device" to config.deviceLabel,
            ),
            "datum" to nowIso,
            "created" to nowIso,
            "creator" to config.creator,
            "zIndex" to System.currentTimeMillis(),
        )

        firestore.collection("call").document(config.firecallId).collection("item")
            .add(data)
            .addOnSuccessListener { ref ->
                onSuccess(
                    MarkerWriteResult(
                        docId = ref.id, lat = lat, lng = lng,
                        timestampMs = measurement.timestampMs,
                        dosisleistungUSvH = measurement.dosisleistungUSvH,
                        cps = measurement.cps,
                        layerId = config.layerId,
                    )
                )
            }
            .addOnFailureListener { err -> onFailure(err) }
    }
}
