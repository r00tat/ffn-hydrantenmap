package at.ffnd.einsatzkarte.radiacode.track

import kotlin.math.asin
import kotlin.math.cos
import kotlin.math.sin
import kotlin.math.sqrt

object Haversine {
    private const val EARTH_RADIUS_M = 6_371_000.0

    fun distanceMeters(latA: Double, lngA: Double, latB: Double, lngB: Double): Double {
        val dLat = Math.toRadians(latB - latA)
        val dLng = Math.toRadians(lngB - lngA)
        val a = sin(dLat / 2).let { it * it } +
            cos(Math.toRadians(latA)) * cos(Math.toRadians(latB)) *
            sin(dLng / 2).let { it * it }
        val c = 2 * asin(sqrt(a))
        return EARTH_RADIUS_M * c
    }
}
