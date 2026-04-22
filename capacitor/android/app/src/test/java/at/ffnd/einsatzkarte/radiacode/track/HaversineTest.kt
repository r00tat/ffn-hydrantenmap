package at.ffnd.einsatzkarte.radiacode.track

import org.junit.Assert.assertEquals
import org.junit.Test

class HaversineTest {
    @Test fun `same point yields zero`() {
        assertEquals(0.0, Haversine.distanceMeters(48.0, 16.0, 48.0, 16.0), 0.001)
    }

    @Test fun `11 meters north of Neusiedl`() {
        // 0.0001 degrees latitude ≈ 11.1 m
        val d = Haversine.distanceMeters(47.9500, 16.8400, 47.9501, 16.8400)
        assertEquals(11.1, d, 0.2)
    }

    @Test fun `known-distance vienna-graz 145km`() {
        // Wien (48.2082,16.3738) → Graz (47.0707,15.4395) ≈ 145 km
        val d = Haversine.distanceMeters(48.2082, 16.3738, 47.0707, 15.4395)
        assertEquals(145_000.0, d, 2_000.0)
    }
}
