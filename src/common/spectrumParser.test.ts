// @vitest-environment jsdom
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, expect, it } from 'vitest';
import {
  channelToEnergy,
  findPeaks,
  fwhmAt,
  identifyNuclides,
  parseSpectrumXml,
  toleranceFor,
  type Peak,
} from './spectrumParser';

const AM241_XML = readFileSync(
  resolve(__dirname, '../../examples/Am-241.xml'),
  'utf-8'
);
const CS137_XML = readFileSync(
  resolve(__dirname, '../../examples/Cs-137.xml'),
  'utf-8'
);
const CO60_XML = readFileSync(
  resolve(__dirname, '../../examples/Co-60.xml'),
  'utf-8',
);

describe('channelToEnergy', () => {
  it('should evaluate polynomial calibration E(ch) = c0 + c1*ch + c2*ch²', () => {
    const coefficients = [2.9903646, 2.3659527, 0.0003559];
    // E(0) = c0
    expect(channelToEnergy(0, coefficients)).toBeCloseTo(2.9903646, 5);
    // E(1) = c0 + c1 + c2
    expect(channelToEnergy(1, coefficients)).toBeCloseTo(
      2.9903646 + 2.3659527 + 0.0003559,
      5
    );
    // E(100) = c0 + c1*100 + c2*10000
    expect(channelToEnergy(100, coefficients)).toBeCloseTo(
      2.9903646 + 2.3659527 * 100 + 0.0003559 * 10000,
      3
    );
  });
});

describe('parseSpectrumXml', () => {
  it('should parse Am-241 sample name and device', () => {
    const data = parseSpectrumXml(AM241_XML);
    expect(data.sampleName).toBe('Am-241');
    expect(data.deviceName).toBe('RadiaCode-101');
  });

  it('should parse Cs-137 sample name and device', () => {
    const data = parseSpectrumXml(CS137_XML);
    expect(data.sampleName).toBe('Cs-137');
    expect(data.deviceName).toBe('RadiaCode-101');
  });

  it('should parse measurement time', () => {
    const am = parseSpectrumXml(AM241_XML);
    expect(am.measurementTime).toBe(36);
    expect(am.liveTime).toBeCloseTo(35.98);

    const cs = parseSpectrumXml(CS137_XML);
    expect(cs.measurementTime).toBe(116);
    expect(cs.liveTime).toBeCloseTo(115.81);
  });

  it('should parse calibration coefficients', () => {
    const data = parseSpectrumXml(AM241_XML);
    expect(data.coefficients).toHaveLength(3);
    expect(data.coefficients[0]).toBeCloseTo(2.9903646, 5);
    expect(data.coefficients[1]).toBeCloseTo(2.3659527, 5);
    expect(data.coefficients[2]).toBeCloseTo(0.0003559, 7);
  });

  it('should parse 1024 channels', () => {
    const data = parseSpectrumXml(AM241_XML);
    expect(data.counts).toHaveLength(1024);
    // First channel
    expect(data.counts[0]).toBe(0);
    // Known value at channel 1
    expect(data.counts[1]).toBe(2);
  });

  it('should compute energies array from calibration', () => {
    const data = parseSpectrumXml(AM241_XML);
    expect(data.energies).toHaveLength(1024);
    // Energy at channel 0 should be c0
    expect(data.energies[0]).toBeCloseTo(2.9903646, 3);
    // Energy should increase with channel number
    expect(data.energies[100]).toBeGreaterThan(data.energies[0]);
    expect(data.energies[1023]).toBeGreaterThan(data.energies[100]);
  });

  it('should parse start and end times', () => {
    const data = parseSpectrumXml(AM241_XML);
    expect(data.startTime).toBe('2026-03-28T08:29:28');
    expect(data.endTime).toBe('2026-03-28T08:30:04');
  });
});

describe('findPeaks', () => {
  it('should detect Am-241 peak near 59.5 keV', () => {
    const data = parseSpectrumXml(AM241_XML);
    const peaks = findPeaks(data.counts, data.energies);
    // Am-241 has a characteristic peak near 59.5 keV
    const am241Peak = peaks.find(
      (p) => p.energy > 49.5 && p.energy < 69.5
    );
    expect(am241Peak).toBeDefined();
    expect(am241Peak!.counts).toBeGreaterThan(100);
  });

  it('should detect Cs-137 peak near 662 keV', () => {
    const data = parseSpectrumXml(CS137_XML);
    const peaks = findPeaks(data.counts, data.energies);
    // Cs-137 has a characteristic peak at 661.7 keV
    const cs137Peak = peaks.find(
      (p) => p.energy > 640 && p.energy < 680
    );
    expect(cs137Peak).toBeDefined();
    expect(cs137Peak!.counts).toBeGreaterThan(50);
  });

  it('should return peaks sorted by counts descending', () => {
    const data = parseSpectrumXml(CS137_XML);
    const peaks = findPeaks(data.counts, data.energies);
    for (let i = 1; i < peaks.length; i++) {
      expect(peaks[i].counts).toBeLessThanOrEqual(peaks[i - 1].counts);
    }
  });
});

describe('identifyNuclides', () => {
  it('should identify Am-241 from Am-241 spectrum', () => {
    const data = parseSpectrumXml(AM241_XML);
    const peaks = findPeaks(data.counts, data.energies);
    const matches = identifyNuclides(peaks);
    const am241Match = matches.find((m) => m.nuclide.name === 'Am-241');
    expect(am241Match).toBeDefined();
    expect(am241Match!.confidence).toBeGreaterThan(0);
    expect(am241Match!.matchedPeaks.length).toBeGreaterThan(0);
  });

  it('should identify Cs-137 from Cs-137 spectrum', () => {
    const data = parseSpectrumXml(CS137_XML);
    const peaks = findPeaks(data.counts, data.energies);
    const matches = identifyNuclides(peaks);
    const cs137Match = matches.find((m) => m.nuclide.name === 'Cs-137');
    expect(cs137Match).toBeDefined();
    expect(cs137Match!.confidence).toBeGreaterThan(0);
    expect(cs137Match!.matchedPeaks.length).toBeGreaterThan(0);
  });

  it('should return matches sorted by confidence descending', () => {
    const data = parseSpectrumXml(CS137_XML);
    const peaks = findPeaks(data.counts, data.energies);
    const matches = identifyNuclides(peaks);
    for (let i = 1; i < matches.length; i++) {
      expect(matches[i].confidence).toBeLessThanOrEqual(
        matches[i - 1].confidence
      );
    }
  });
});

describe('fwhmAt', () => {
  it('should return 12% FWHM at 662 keV reference', () => {
    expect(fwhmAt(662)).toBeCloseTo(79.44, 1);
  });

  it('should scale with sqrt(E)', () => {
    expect(fwhmAt(1332)).toBeCloseTo(112.7, 0);
    expect(fwhmAt(60)).toBeCloseTo(23.9, 0);
  });

  it('should accept custom reference resolution', () => {
    expect(fwhmAt(662, 0.09)).toBeCloseTo(59.58, 1);
  });
});

describe('toleranceFor (energy-dependent match tolerance)', () => {
  it('should return HWHM at high energies', () => {
    expect(toleranceFor(662)).toBeCloseTo(39.7, 1);
    expect(toleranceFor(1332)).toBeCloseTo(56.3, 1);
  });

  it('should enforce a minimum of 5 keV at low energies', () => {
    expect(toleranceFor(5)).toBe(5);
  });
});

describe('identifyNuclides with energy-dependent tolerance', () => {
  it('should match Co-60 1332 keV peak within HWHM', () => {
    const peaks: Peak[] = [
      { channel: 560, energy: 1362, counts: 1000 },
      { channel: 490, energy: 1200, counts: 1000 },
    ];
    const matches = identifyNuclides(peaks);
    const co60 = matches.find((m) => m.nuclide.name === 'Co-60');
    expect(co60?.matchedPeaks.length).toBeGreaterThanOrEqual(1);
  });
});

describe('findPeaks Poisson significance', () => {
  it('should reject a weak peak (~1σ above background)', () => {
    // background=100, σ=√100=10, threshold = 100 + 3·10 = 130
    // smoothed peak centroid ≈ 108.8 → rejected
    const counts = new Array(200).fill(100);
    counts[98] = 104;
    counts[99] = 108;
    counts[100] = 120;
    counts[101] = 108;
    counts[102] = 104;
    const energies = counts.map((_, i) => i * 3);
    const peaks = findPeaks(counts, energies, { minEnergy: 0 });
    expect(peaks.find((p) => p.channel === 100)).toBeUndefined();
  });

  it('should accept a strong peak (~10σ raw peak height)', () => {
    // background=100, σ=10, threshold = 130
    // smoothed peak centroid = 144 → accepted
    const counts = new Array(200).fill(100);
    counts[98] = 115;
    counts[99] = 145;
    counts[100] = 200;
    counts[101] = 145;
    counts[102] = 115;
    const energies = counts.map((_, i) => i * 3);
    const peaks = findPeaks(counts, energies, { minEnergy: 0 });
    expect(peaks.find((p) => p.channel === 100)).toBeDefined();
  });
});

describe('identifyNuclides intensity cap for weak single-branch nuclides', () => {
  it('should not give Ra-226 (3.6% branch) full intensityMatched for a single weak peak', () => {
    const peaks: Peak[] = [{ channel: 80, energy: 186.5, counts: 100 }];
    const matches = identifyNuclides(peaks);
    const ra226 = matches.find((m) => m.nuclide.name === 'Ra-226');
    expect(ra226).toBeDefined();
    // totalIntensity = 0.036, matchedIntensity = 0.036
    // with cap at 1.0: intensityMatched = 0.036 / max(0.036, 1.0) = 0.036
    // confidence = 0.40*0.036 + 0.45*avgStrength + 0.15*avgAccuracy
    //            ≤ 0.40*0.036 + 0.45*1.0 + 0.15*1.0 = 0.614
    // with single peak where avgStrength=1.0 and accuracy near 1.0:
    //            ≈ 0.014 + 0.45 + ~0.15 = ~0.61 — but this is well below a
    //            proper dominant-line match (Cs-137 single peak ≈ 0.94).
    expect(ra226!.confidence).toBeLessThan(0.65);
  });

  it('should still give Cs-137 (85% branch) high confidence for a single peak', () => {
    const peaks: Peak[] = [{ channel: 300, energy: 661.7, counts: 1000 }];
    const matches = identifyNuclides(peaks);
    const cs137 = matches.find((m) => m.nuclide.name === 'Cs-137');
    expect(cs137).toBeDefined();
    // intensityMatched = 0.851 / max(0.851, 1.0) = 0.851
    // confidence = 0.40*0.851 + 0.45*1.0 + 0.15*1.0 ≈ 0.94
    expect(cs137!.confidence).toBeGreaterThan(0.9);
  });
});

describe('identifyNuclides with intensity weighting', () => {
  it('should give Ba-133 high confidence for dominant 356 keV match only', () => {
    const peaks: Peak[] = [
      { channel: 150, energy: 356, counts: 1000 },
    ];
    const matches = identifyNuclides(peaks);
    const ba133 = matches.find((m) => m.nuclide.name === 'Ba-133');
    expect(ba133).toBeDefined();
    // intensityMatched = 0.621 / (0.329+0.072+0.183+0.621+0.089) = 0.48
    // confidence = 0.40*0.48 + 0.45*1.0 + 0.15*~1.0 ≈ 0.79
    expect(ba133!.confidence).toBeGreaterThan(0.7);
  });

  it('should give Co-60 partial confidence for one-of-two peaks', () => {
    const peaks: Peak[] = [
      { channel: 500, energy: 1332.5, counts: 1000 },
    ];
    const matches = identifyNuclides(peaks);
    const co60 = matches.find((m) => m.nuclide.name === 'Co-60');
    expect(co60).toBeDefined();
    expect(co60!.confidence).toBeGreaterThan(0.4);
    expect(co60!.confidence).toBeLessThan(0.85);
  });
});

describe('identifyNuclides with example spectra', () => {
  it('ranks Am-241 as top match for Am-241.xml', () => {
    const data = parseSpectrumXml(AM241_XML);
    const peaks = findPeaks(data.counts, data.energies);
    const matches = identifyNuclides(peaks);
    expect(matches[0].nuclide.name).toBe('Am-241');
  });

  it('ranks Cs-137 as top match for Cs-137.xml', () => {
    const data = parseSpectrumXml(CS137_XML);
    const peaks = findPeaks(data.counts, data.energies);
    const matches = identifyNuclides(peaks);
    expect(matches[0].nuclide.name).toBe('Cs-137');
  });

  it('ranks Co-60 as top match for Co-60.xml', () => {
    const data = parseSpectrumXml(CO60_XML);
    const peaks = findPeaks(data.counts, data.energies);
    const matches = identifyNuclides(peaks);
    expect(matches[0].nuclide.name).toBe('Co-60');
  });
});
