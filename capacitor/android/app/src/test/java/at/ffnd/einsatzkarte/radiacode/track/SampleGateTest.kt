package at.ffnd.einsatzkarte.radiacode.track

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class SampleGateTest {
    private val normal = SampleRateConfig(minDistanceMeters = 5.0, minIntervalSec = 1.0, maxIntervalSec = 15.0)

    @Test fun `skips when below minInterval`() {
        assertFalse(SampleGate.shouldSample(distanceMeters = 100.0, secondsSinceLast = 0.5, config = normal))
    }

    @Test fun `writes when maxInterval exceeded even if distance is zero`() {
        assertTrue(SampleGate.shouldSample(distanceMeters = 0.0, secondsSinceLast = 20.0, config = normal))
    }

    @Test fun `writes when distance above minDistance and above minInterval`() {
        assertTrue(SampleGate.shouldSample(distanceMeters = 10.0, secondsSinceLast = 2.0, config = normal))
    }

    @Test fun `skips when distance below minDistance and still under maxInterval`() {
        assertFalse(SampleGate.shouldSample(distanceMeters = 2.0, secondsSinceLast = 2.0, config = normal))
    }

    @Test fun `rate config table matches TS RATE_CONFIG`() {
        val niedrig = SampleRateConfig.of("niedrig")
        val normalCfg = SampleRateConfig.of("normal")
        val hoch = SampleRateConfig.of("hoch")
        assertTrue(niedrig.minDistanceMeters == 10.0 && niedrig.minIntervalSec == 1.0 && niedrig.maxIntervalSec == 30.0)
        assertTrue(normalCfg.minDistanceMeters == 5.0 && normalCfg.minIntervalSec == 1.0 && normalCfg.maxIntervalSec == 15.0)
        assertTrue(hoch.minDistanceMeters == 2.0 && hoch.minIntervalSec == 1.0 && hoch.maxIntervalSec == 5.0)
    }

    // Presets → sealed-class-Konversion
    @Test fun `presets mapping`() {
        assertEquals(SampleRate.Niedrig, SampleRate.fromString("niedrig"))
        assertEquals(SampleRate.Normal,  SampleRate.fromString("normal"))
        assertEquals(SampleRate.Hoch,    SampleRate.fromString("hoch"))
    }

    @Test fun `custom only interval triggers on max interval`() {
        val rate = SampleRate.Custom(maxIntervalSec = 10.0, minDistanceMeters = null, minDoseRateDeltaUSvH = null)
        assertFalse(SampleGate.shouldSample(distanceM = 100.0, dtSec = 5.0, doseRateDeltaUSvH = null, rate = rate))
        assertTrue (SampleGate.shouldSample(distanceM = 0.0,   dtSec = 10.0, doseRateDeltaUSvH = null, rate = rate))
    }

    @Test fun `custom only distance triggers on distance`() {
        val rate = SampleRate.Custom(maxIntervalSec = null, minDistanceMeters = 5.0, minDoseRateDeltaUSvH = null)
        assertFalse(SampleGate.shouldSample(distanceM = 4.9, dtSec = 3600.0, doseRateDeltaUSvH = null, rate = rate))
        assertTrue (SampleGate.shouldSample(distanceM = 5.0, dtSec = 2.0,   doseRateDeltaUSvH = null, rate = rate))
    }

    @Test fun `custom only dose delta triggers on abs delta`() {
        val rate = SampleRate.Custom(maxIntervalSec = null, minDistanceMeters = null, minDoseRateDeltaUSvH = 0.1)
        assertFalse(SampleGate.shouldSample(0.0, 5.0, doseRateDeltaUSvH = 0.05, rate = rate))
        assertTrue (SampleGate.shouldSample(0.0, 5.0, doseRateDeltaUSvH = -0.2, rate = rate))
    }

    @Test fun `custom hard 1s floor applies`() {
        val rate = SampleRate.Custom(0.0, 0.0, 0.0) // alle "triggern immer"
        assertFalse(SampleGate.shouldSample(100.0, 0.5, 1.0, rate = rate))
        assertTrue (SampleGate.shouldSample(100.0, 1.0, 1.0, rate = rate))
    }

    @Test fun `custom all null never samples`() {
        val rate = SampleRate.Custom(null, null, null)
        assertFalse(SampleGate.shouldSample(100.0, 60.0, 10.0, rate = rate))
    }

    @Test fun `presets via new API behave like config-based API`() {
        // Normal preset: dist>=5 or dt>=15, floor 1s
        val rate = SampleRate.Normal
        assertFalse(SampleGate.shouldSample(4.9, 2.0, null, rate))
        assertTrue (SampleGate.shouldSample(5.0, 2.0, null, rate))
        assertTrue (SampleGate.shouldSample(0.0, 15.0, null, rate))
        assertFalse(SampleGate.shouldSample(100.0, 0.5, null, rate))
    }
}
