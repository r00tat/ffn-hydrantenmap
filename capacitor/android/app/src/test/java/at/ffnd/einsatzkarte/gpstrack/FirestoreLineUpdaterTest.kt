package at.ffnd.einsatzkarte.gpstrack

import org.junit.Assert.*
import org.junit.Test

class FirestoreLineUpdaterTest {
    @Test fun `appendPositions on empty positions initializes array`() {
        val upd = LineUpdate.compute(
            existingPositionsJson = null,
            lat = 47.0, lng = 16.0,
        )
        assertEquals("[[47.0,16.0]]", upd.positionsJson)
        assertEquals(47.0, upd.destLat, 1e-9)
        assertEquals(16.0, upd.destLng, 1e-9)
        assertEquals(0.0, upd.distance, 1e-6)
    }

    @Test fun `appendPositions accumulates distance`() {
        val first = LineUpdate.compute(null, 47.0, 16.0)
        val second = LineUpdate.compute(first.positionsJson, 47.001, 16.0)
        // ~ 111 m pro 0.001 lat
        assertTrue("got ${second.distance}", second.distance in 100.0..115.0)
        assertTrue(second.positionsJson.startsWith("[[47.0,16.0]"))
    }

    @Test fun `appendPositions tolerates malformed existing json`() {
        val upd = LineUpdate.compute(
            existingPositionsJson = "this is not json",
            lat = 47.0, lng = 16.0,
        )
        assertEquals("[[47.0,16.0]]", upd.positionsJson)
    }

    @Test fun `three-point round trip accumulates distance`() {
        val a = LineUpdate.compute(null, 47.0, 16.0)
        val b = LineUpdate.compute(a.positionsJson, 47.001, 16.0)
        val c = LineUpdate.compute(b.positionsJson, 47.002, 16.0)
        assertTrue("got ${c.distance}", c.distance in 200.0..230.0)
        // 3 points serialized
        assertTrue(c.positionsJson.startsWith("[[47.0,16.0],[47.001,16.0],[47.002"))
    }

    @Test fun `empty array string is treated as empty`() {
        val upd = LineUpdate.compute("[]", 47.0, 16.0)
        assertEquals("[[47.0,16.0]]", upd.positionsJson)
        assertEquals(0.0, upd.distance, 1e-9)
    }

    @Test fun `whitespace-tolerant parse`() {
        val upd = LineUpdate.compute("[ [47.0, 16.0] ]", 47.001, 16.0)
        assertTrue("got ${upd.distance}", upd.distance in 100.0..115.0)
    }
}
