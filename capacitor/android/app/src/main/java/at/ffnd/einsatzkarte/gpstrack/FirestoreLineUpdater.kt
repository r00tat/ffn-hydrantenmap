package at.ffnd.einsatzkarte.gpstrack

import android.util.Log
import at.ffnd.einsatzkarte.radiacode.track.Haversine
import com.google.firebase.firestore.FirebaseFirestore

data class LineUpdate(
    val positionsJson: String,
    val destLat: Double,
    val destLng: Double,
    val distance: Double,
) {
    companion object {
        fun compute(existingPositionsJson: String?, lat: Double, lng: Double): LineUpdate {
            val points = mutableListOf<DoubleArray>()
            if (!existingPositionsJson.isNullOrBlank()) {
                try {
                    parsePositions(existingPositionsJson).forEach { points += it }
                } catch (t: Throwable) {
                    try {
                        android.util.Log.w(
                            "GpsTrack",
                            "positions-json parse failed len=${existingPositionsJson.length} preview='${existingPositionsJson.take(64)}'",
                            t,
                        )
                    } catch (_: Throwable) { /* Log is a Stub in unit tests */ }
                    // fall through — treat as empty
                    points.clear()
                }
            }
            points += doubleArrayOf(lat, lng)
            var dist = 0.0
            for (i in 1 until points.size) {
                dist += Haversine.distanceMeters(
                    points[i - 1][0], points[i - 1][1],
                    points[i][0], points[i][1],
                )
            }
            val json = buildString {
                append('[')
                for ((i, p) in points.withIndex()) {
                    if (i > 0) append(',')
                    append('[').append(p[0]).append(',').append(p[1]).append(']')
                }
                append(']')
            }
            return LineUpdate(json, lat, lng, dist)
        }

        /**
         * Minimaler Parser für `[[lat,lng],[lat,lng],...]` — unabhängig von
         * `org.json.JSONArray`, damit der pure-Kotlin-Teil unter JVM-Unit-Tests
         * (ohne Android-Stubs) lauffähig ist. Wirft bei unerwarteten Zeichen.
         */
        private fun parsePositions(s: String): List<DoubleArray> {
            val out = mutableListOf<DoubleArray>()
            var i = 0
            fun skipWs() { while (i < s.length && s[i].isWhitespace()) i++ }
            skipWs()
            require(i < s.length && s[i] == '[') { "expected '['" }
            i++
            skipWs()
            if (i < s.length && s[i] == ']') return out
            while (i < s.length) {
                skipWs()
                require(s[i] == '[') { "expected pair '['" }
                i++
                skipWs()
                val latEnd = readNumberEnd(s, i)
                val lat = s.substring(i, latEnd).toDouble()
                i = latEnd
                skipWs()
                require(i < s.length && s[i] == ',') { "expected ','" }
                i++
                skipWs()
                val lngEnd = readNumberEnd(s, i)
                val lng = s.substring(i, lngEnd).toDouble()
                i = lngEnd
                skipWs()
                require(i < s.length && s[i] == ']') { "expected pair ']'" }
                i++
                out += doubleArrayOf(lat, lng)
                skipWs()
                if (i < s.length && s[i] == ',') { i++; continue }
                break
            }
            skipWs()
            require(i < s.length && s[i] == ']') { "expected final ']'" }
            return out
        }

        private fun readNumberEnd(s: String, start: Int): Int {
            var j = start
            while (j < s.length) {
                val c = s[j]
                if (c.isDigit() || c == '-' || c == '+' || c == '.' || c == 'e' || c == 'E') j++
                else break
            }
            require(j > start) { "expected number at $start" }
            return j
        }
    }
}

class FirestoreLineUpdater(dbName: String) : LineUpdater {
    companion object { private const val TAG = "GpsTrack" }

    private val firestore: FirebaseFirestore = (
        if (dbName.isBlank()) FirebaseFirestore.getInstance()
        else FirebaseFirestore.getInstance(dbName)
    ).also {
        android.util.Log.i(TAG, "Firestore DB = ${if (dbName.isBlank()) "(default)" else dbName}")
    }

    override fun append(
        firecallId: String,
        lineId: String,
        lat: Double,
        lng: Double,
        ts: Long,
        onSuccess: () -> Unit,
        onFailure: (Throwable) -> Unit,
    ) {
        val doc = firestore.collection("call").document(firecallId)
            .collection("item").document(lineId)
        doc.get()
            .addOnSuccessListener { snap ->
                val existing = snap.getString("positions")
                val upd = LineUpdate.compute(existing, lat, lng)
                val patch = linkedMapOf<String, Any>(
                    "positions" to upd.positionsJson,
                    "destLat" to upd.destLat,
                    "destLng" to upd.destLng,
                    "distance" to upd.distance,
                )
                doc.update(patch)
                    .addOnSuccessListener { onSuccess() }
                    .addOnFailureListener { err ->
                        Log.w(TAG, "line update failed", err); onFailure(err)
                    }
            }
            .addOnFailureListener { err ->
                Log.w(TAG, "line read failed", err); onFailure(err)
            }
    }
}
