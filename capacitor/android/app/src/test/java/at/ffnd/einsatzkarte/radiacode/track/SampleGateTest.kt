package at.ffnd.einsatzkarte.radiacode.track

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
}
