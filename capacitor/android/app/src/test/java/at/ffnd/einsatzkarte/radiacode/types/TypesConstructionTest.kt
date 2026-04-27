package at.ffnd.einsatzkarte.radiacode.types

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotEquals
import org.junit.Test
import java.time.Duration
import java.time.Instant

class TypesConstructionTest {
    private val sampleInstant: Instant = Instant.parse("2026-04-27T10:15:30Z")

    @Test fun `RealTimeData fields`() {
        val rtd = RealTimeData(
            dt = sampleInstant,
            countRate = 12.5f,
            countRateErr = 1.5,
            doseRate = 0.25f,
            doseRateErr = 2.5,
            flags = 0x1234,
            realTimeFlags = 0xAB,
        )
        assertEquals(sampleInstant, rtd.dt)
        assertEquals(12.5f, rtd.countRate, 0.0f)
        assertEquals(1.5, rtd.countRateErr, 0.0)
        assertEquals(0.25f, rtd.doseRate, 0.0f)
        assertEquals(2.5, rtd.doseRateErr, 0.0)
        assertEquals(0x1234, rtd.flags)
        assertEquals(0xAB, rtd.realTimeFlags)
    }

    @Test fun `RealTimeData equals and hashCode`() {
        val a = RealTimeData(sampleInstant, 1.0f, 2.0, 3.0f, 4.0, 5, 6)
        val b = RealTimeData(sampleInstant, 1.0f, 2.0, 3.0f, 4.0, 5, 6)
        val c = RealTimeData(sampleInstant, 1.0f, 2.0, 3.0f, 4.0, 5, 7)
        assertEquals(a, b)
        assertEquals(a.hashCode(), b.hashCode())
        assertNotEquals(a, c)
    }

    @Test fun `RawData fields`() {
        val r = RawData(dt = sampleInstant, countRate = 10.0f, doseRate = 0.1f)
        assertEquals(sampleInstant, r.dt)
        assertEquals(10.0f, r.countRate, 0.0f)
        assertEquals(0.1f, r.doseRate, 0.0f)
    }

    @Test fun `DoseRateDB fields`() {
        val d = DoseRateDB(
            dt = sampleInstant,
            count = 4_000_000_000L,
            countRate = 8.0f,
            doseRate = 0.5f,
            doseRateErr = 1.2,
            flags = 0xFFFF,
        )
        assertEquals(sampleInstant, d.dt)
        assertEquals(4_000_000_000L, d.count)
        assertEquals(8.0f, d.countRate, 0.0f)
        assertEquals(0.5f, d.doseRate, 0.0f)
        assertEquals(1.2, d.doseRateErr, 0.0)
        assertEquals(0xFFFF, d.flags)
    }

    @Test fun `RareData fields`() {
        val r = RareData(
            dt = sampleInstant,
            duration = 86_400L,
            dose = 0.001f,
            temperature = 22.5,
            chargeLevel = 0.83,
            flags = 0,
        )
        assertEquals(sampleInstant, r.dt)
        assertEquals(86_400L, r.duration)
        assertEquals(0.001f, r.dose, 0.0f)
        assertEquals(22.5, r.temperature, 0.0)
        assertEquals(0.83, r.chargeLevel, 0.0)
        assertEquals(0, r.flags)
    }

    @Test fun `Event fields`() {
        val e = Event(
            dt = sampleInstant,
            event = EventId.USER_EVENT,
            eventParam1 = 42,
            flags = 7,
        )
        assertEquals(sampleInstant, e.dt)
        assertEquals(EventId.USER_EVENT, e.event)
        assertEquals(42, e.eventParam1)
        assertEquals(7, e.flags)
    }

    @Test fun `Spectrum fields`() {
        val s = Spectrum(
            duration = Duration.ofSeconds(60),
            a0 = 0.0f,
            a1 = 1.5f,
            a2 = 0.0001f,
            counts = listOf(0, 1, 2, 3, 4),
        )
        assertEquals(Duration.ofSeconds(60), s.duration)
        assertEquals(0.0f, s.a0, 0.0f)
        assertEquals(1.5f, s.a1, 0.0f)
        assertEquals(0.0001f, s.a2, 0.0f)
        assertEquals(listOf(0, 1, 2, 3, 4), s.counts)
    }

    @Test fun `AlarmLimits fields`() {
        val a = AlarmLimits(
            l1CountRate = 60.0,
            l2CountRate = 600.0,
            countUnit = "cps",
            l1DoseRate = 1.0,
            l2DoseRate = 10.0,
            l1Dose = 100.0,
            l2Dose = 1000.0,
            doseUnit = "uSv",
        )
        assertEquals(60.0, a.l1CountRate, 0.0)
        assertEquals(600.0, a.l2CountRate, 0.0)
        assertEquals("cps", a.countUnit)
        assertEquals(1.0, a.l1DoseRate, 0.0)
        assertEquals(10.0, a.l2DoseRate, 0.0)
        assertEquals(100.0, a.l1Dose, 0.0)
        assertEquals(1000.0, a.l2Dose, 0.0)
        assertEquals("uSv", a.doseUnit)
    }

    @Test fun `AlarmLimits equals and hashCode`() {
        val a = AlarmLimits(1.0, 2.0, "cps", 3.0, 4.0, 5.0, 6.0, "uSv")
        val b = AlarmLimits(1.0, 2.0, "cps", 3.0, 4.0, 5.0, 6.0, "uSv")
        val c = AlarmLimits(1.0, 2.0, "cps", 3.0, 4.0, 5.0, 6.0, "uR")
        assertEquals(a, b)
        assertEquals(a.hashCode(), b.hashCode())
        assertNotEquals(a, c)
    }
}
