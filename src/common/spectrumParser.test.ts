// @vitest-environment jsdom
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { crc32 } from 'node:zlib';
import { describe, expect, it } from 'vitest';

/**
 * Build a minimal single-entry ZIP archive (STORE, no compression) in the
 * test environment. fflate.zipSync has a known compatibility issue with
 * vitest/jsdom (output is mis-sized), but the production unzip path uses
 * fflate.unzipSync which works fine — so we build the fixture archive by
 * hand here and let the parser exercise the real unzip logic.
 */
function buildStoredZip(name: string, data: Uint8Array): Uint8Array {
  const nameBytes = new TextEncoder().encode(name);
  const crc = crc32(Buffer.from(data));
  const size = data.length;
  const local = new Uint8Array(30 + nameBytes.length + size);
  const lv = new DataView(local.buffer);
  lv.setUint32(0, 0x04034b50, true);
  lv.setUint16(4, 20, true);
  lv.setUint32(14, crc, true);
  lv.setUint32(18, size, true);
  lv.setUint32(22, size, true);
  lv.setUint16(26, nameBytes.length, true);
  local.set(nameBytes, 30);
  local.set(data, 30 + nameBytes.length);

  const cd = new Uint8Array(46 + nameBytes.length);
  const cv = new DataView(cd.buffer);
  cv.setUint32(0, 0x02014b50, true);
  cv.setUint16(4, 20, true);
  cv.setUint16(6, 20, true);
  cv.setUint32(16, crc, true);
  cv.setUint32(20, size, true);
  cv.setUint32(24, size, true);
  cv.setUint16(28, nameBytes.length, true);
  cd.set(nameBytes, 46);

  const end = new Uint8Array(22);
  const ev = new DataView(end.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(8, 1, true);
  ev.setUint16(10, 1, true);
  ev.setUint32(12, cd.length, true);
  ev.setUint32(16, local.length, true);

  const out = new Uint8Array(local.length + cd.length + end.length);
  out.set(local, 0);
  out.set(cd, local.length);
  out.set(end, local.length + cd.length);
  return out;
}
import {
  channelToEnergy,
  findPeaks,
  fwhmAt,
  identifyNuclides,
  parseSpectrogramIosRcspg,
  parseSpectrogramRcspg,
  parseSpectrumCsv,
  parseSpectrumFile,
  parseSpectrumNpesJson,
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
const CS137_RCSPG = readFileSync(
  resolve(__dirname, '../../examples/Spectrogram_Cs-137.rcspg'),
  'utf-8',
);
const IOS_RCSPG = readFileSync(
  resolve(__dirname, '../../examples/Spectrum_2026-04-19 20-15-08 ios.rcspg'),
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

describe('parseSpectrogramRcspg', () => {
  it('should parse sample name from Spectrogram header', () => {
    const data = parseSpectrogramRcspg(CS137_RCSPG);
    expect(data.sampleName).toBe('Cs-137');
  });

  it('should parse device serial as device name', () => {
    const data = parseSpectrogramRcspg(CS137_RCSPG);
    expect(data.deviceName).toBe('RC-110-004760');
  });

  it('should parse accumulation time as measurement and live time', () => {
    const data = parseSpectrogramRcspg(CS137_RCSPG);
    expect(data.measurementTime).toBe(169);
    expect(data.liveTime).toBe(169);
  });

  it('should parse start time as ISO string', () => {
    const data = parseSpectrogramRcspg(CS137_RCSPG);
    expect(data.startTime).toBe('2026-03-28T09:38:06');
  });

  it('should compute end time as start + accumulation', () => {
    const data = parseSpectrogramRcspg(CS137_RCSPG);
    expect(data.endTime).toBe('2026-03-28T09:40:55');
  });

  it('should parse calibration coefficients from float32 LE', () => {
    const data = parseSpectrogramRcspg(CS137_RCSPG);
    expect(data.coefficients).toHaveLength(3);
    expect(data.coefficients[0]).toBeCloseTo(2.9903646, 4);
    expect(data.coefficients[1]).toBeCloseTo(2.3659527, 4);
    expect(data.coefficients[2]).toBeCloseTo(0.0003559, 6);
  });

  it('should parse 1024 channel counts as uint32 LE', () => {
    const data = parseSpectrogramRcspg(CS137_RCSPG);
    expect(data.counts).toHaveLength(1024);
    // First channel from hex "6C CB 19 00" = 0x0019CB6C = 1690476
    expect(data.counts[0]).toBe(1690476);
    // Channels are all non-negative
    expect(data.counts.every((c) => c >= 0)).toBe(true);
  });

  it('should compute energies array from calibration', () => {
    const data = parseSpectrogramRcspg(CS137_RCSPG);
    expect(data.energies).toHaveLength(1024);
    expect(data.energies[0]).toBeCloseTo(data.coefficients[0], 3);
    expect(data.energies[1023]).toBeGreaterThan(data.energies[0]);
  });
});

describe('parseSpectrogramIosRcspg (iOS .rcspg JSON)', () => {
  it('should parse title as sample name', () => {
    const data = parseSpectrogramIosRcspg(IOS_RCSPG);
    expect(data.sampleName).toBe('2026-04-19 20-15-08');
  });

  it('should parse deviceId as device name', () => {
    const data = parseSpectrogramIosRcspg(IOS_RCSPG);
    expect(data.deviceName).toBe('RC-110-004760');
  });

  it('should parse string coefficients as numbers', () => {
    const data = parseSpectrogramIosRcspg(IOS_RCSPG);
    expect(data.coefficients).toHaveLength(3);
    expect(data.coefficients[0]).toBeCloseTo(2.990365, 5);
    expect(data.coefficients[1]).toBeCloseTo(2.365953, 5);
    expect(data.coefficients[2]).toBeCloseTo(0.000356, 6);
  });

  it('should sum pulses across all time slices into channelCount counts', () => {
    const data = parseSpectrogramIosRcspg(IOS_RCSPG);
    expect(data.counts).toHaveLength(1024);
    // Total counts = sum of all pulses across all slices
    const total = data.counts.reduce((a, b) => a + b, 0);
    expect(total).toBe(298037);
  });

  it('should sum collectTime values into measurement time', () => {
    const data = parseSpectrogramIosRcspg(IOS_RCSPG);
    expect(data.measurementTime).toBe(9501);
    expect(data.liveTime).toBe(9501);
  });

  it('should derive start time from startTimeTimestamp', () => {
    const data = parseSpectrogramIosRcspg(IOS_RCSPG);
    // 1776622509102 ms = 2026-04-19T18:15:09.102Z
    expect(data.startTime).toBe('2026-04-19T18:15:09');
  });

  it('should compute end time as start + accumulation', () => {
    const data = parseSpectrogramIosRcspg(IOS_RCSPG);
    // 1776622509102 + 9501*1000 = 1776632010102 = 2026-04-19T20:53:30.102Z
    expect(data.endTime).toBe('2026-04-19T20:53:30');
  });

  it('should compute energies from calibration', () => {
    const data = parseSpectrogramIosRcspg(IOS_RCSPG);
    expect(data.energies).toHaveLength(1024);
    expect(data.energies[0]).toBeCloseTo(data.coefficients[0], 3);
    expect(data.energies[1023]).toBeGreaterThan(data.energies[0]);
  });

  it('should pad truncated pulses arrays to channelCount', () => {
    const minimal = {
      title: 'test',
      channelCount: 5,
      startTimeTimestamp: 0,
      deviceId: 'dev',
      coefficients: ['0', '1', '0'],
      spectrums: [
        { collectTime: 1, timestamp: 0, pulses: [1, 2] },
        { collectTime: 2, timestamp: 0, pulses: [0, 1, 1] },
      ],
    };
    const data = parseSpectrogramIosRcspg(JSON.stringify(minimal));
    expect(data.counts).toEqual([1, 3, 1, 0, 0]);
    expect(data.measurementTime).toBe(3);
  });

  it('should throw on missing spectrums or channelCount', () => {
    expect(() =>
      parseSpectrogramIosRcspg('{"title":"x"}'),
    ).toThrow();
  });
});

describe('parseSpectrumNpesJson (NPES-JSON v2)', () => {
  const exampleSpectrum = {
    schemaVersion: 'NPESv2',
    data: [
      {
        deviceData: {
          softwareName: 'Radiacode iOS 1.2',
          deviceName: 'RadiaCode-103',
        },
        sampleInfo: {
          name: 'Cs-137',
          note: 'Calibration sample',
        },
        resultData: {
          startTime: '2026-01-10T17:14:50+01:00',
          endTime: '2026-01-10T17:19:56+01:00',
          energySpectrum: {
            numberOfChannels: 4,
            energyCalibration: {
              polynomialOrder: 2,
              coefficients: [1.5, 2.0, 0.001],
            },
            measurementTime: 306,
            spectrum: [10, 20, 30, 40],
          },
        },
      },
    ],
  };

  it('should reject documents without schemaVersion NPESv2', () => {
    expect(() => parseSpectrumNpesJson('{"schemaVersion":"Other","data":[]}'))
      .toThrow();
  });

  it('should parse sample name, device name and software', () => {
    const data = parseSpectrumNpesJson(JSON.stringify(exampleSpectrum));
    expect(data.sampleName).toBe('Cs-137');
    expect(data.deviceName).toBe('RadiaCode-103');
  });

  it('should parse measurement time (live = measurement for NPES-JSON)', () => {
    const data = parseSpectrumNpesJson(JSON.stringify(exampleSpectrum));
    expect(data.measurementTime).toBe(306);
    expect(data.liveTime).toBe(306);
  });

  it('should parse start and end time verbatim', () => {
    const data = parseSpectrumNpesJson(JSON.stringify(exampleSpectrum));
    expect(data.startTime).toBe('2026-01-10T17:14:50+01:00');
    expect(data.endTime).toBe('2026-01-10T17:19:56+01:00');
  });

  it('should parse calibration coefficients', () => {
    const data = parseSpectrumNpesJson(JSON.stringify(exampleSpectrum));
    expect(data.coefficients).toEqual([1.5, 2.0, 0.001]);
  });

  it('should parse counts and compute energies', () => {
    const data = parseSpectrumNpesJson(JSON.stringify(exampleSpectrum));
    expect(data.counts).toEqual([10, 20, 30, 40]);
    expect(data.energies).toHaveLength(4);
    // E(0) = 1.5
    expect(data.energies[0]).toBeCloseTo(1.5, 5);
    // E(1) = 1.5 + 2.0 + 0.001 = 3.501
    expect(data.energies[1]).toBeCloseTo(3.501, 5);
  });

  it('should default calibration to [0,1,0] when missing', () => {
    const minimal = {
      schemaVersion: 'NPESv2',
      data: [
        {
          resultData: {
            energySpectrum: {
              numberOfChannels: 3,
              spectrum: [0, 5, 10],
            },
          },
        },
      ],
    };
    const data = parseSpectrumNpesJson(JSON.stringify(minimal));
    expect(data.coefficients).toEqual([0, 1, 0]);
    expect(data.energies[2]).toBeCloseTo(2, 5);
  });

  it('should throw when numberOfChannels does not match spectrum length', () => {
    const bad = {
      schemaVersion: 'NPESv2',
      data: [
        {
          resultData: {
            energySpectrum: {
              numberOfChannels: 5,
              spectrum: [1, 2, 3],
            },
          },
        },
      ],
    };
    expect(() => parseSpectrumNpesJson(JSON.stringify(bad))).toThrow();
  });
});

describe('parseSpectrumCsv', () => {
  const sampleCsv = ['0,0', '1,5', '2,17', '3,42', '4,3'].join('\n');

  it('should parse counts from channel,counts rows', () => {
    const data = parseSpectrumCsv(sampleCsv);
    expect(data.counts).toEqual([0, 5, 17, 42, 3]);
  });

  it('should default calibration to RadiaCode-110-like [0,3,0]', () => {
    const data = parseSpectrumCsv(sampleCsv);
    expect(data.coefficients).toEqual([0, 3, 0]);
    expect(data.energies[1]).toBeCloseTo(3, 5);
    expect(data.energies[4]).toBeCloseTo(12, 5);
  });

  it('should extract measurement time from filename "_<N>s.csv"', () => {
    const data = parseSpectrumCsv(
      sampleCsv,
      'Spectrum_2021-05-12_13-5355_1426s.csv',
    );
    expect(data.measurementTime).toBe(1426);
    expect(data.liveTime).toBe(1426);
  });

  it('should default measurement time to 0 when filename has no duration', () => {
    const data = parseSpectrumCsv(sampleCsv, 'random.csv');
    expect(data.measurementTime).toBe(0);
    expect(data.liveTime).toBe(0);
  });

  it('should extract start time from filename and compute end time', () => {
    const data = parseSpectrumCsv(
      sampleCsv,
      'Spectrum_2021-05-12_13-5355_1426s.csv',
    );
    expect(data.startTime).toBe('2021-05-12T13:53:55');
    // 1426 seconds later = 13:53:55 + 23m46s = 14:17:41
    expect(data.endTime).toBe('2021-05-12T14:17:41');
  });

  it('should use filename stem as sampleName when no metadata', () => {
    const data = parseSpectrumCsv(sampleCsv, 'Probe_A.csv');
    expect(data.sampleName).toBe('Probe_A');
  });

  it('should skip blank and comment lines', () => {
    const withBlanks = ['# header', '0,0', '', '1,5', '2,10', ''].join('\n');
    const data = parseSpectrumCsv(withBlanks);
    expect(data.counts).toEqual([0, 5, 10]);
  });
});

describe('parseSpectrumFile (dispatcher)', () => {
  it('should parse XML content', () => {
    const data = parseSpectrumFile(CS137_XML);
    expect(data.sampleName).toBe('Cs-137');
    expect(data.counts).toHaveLength(1024);
  });

  it('should parse rcspg content', () => {
    const data = parseSpectrumFile(CS137_RCSPG);
    expect(data.sampleName).toBe('Cs-137');
    expect(data.counts).toHaveLength(1024);
  });

  it('should parse NPES-JSON content', () => {
    const npes = JSON.stringify({
      schemaVersion: 'NPESv2',
      data: [
        {
          resultData: {
            energySpectrum: {
              numberOfChannels: 3,
              spectrum: [1, 2, 3],
            },
          },
        },
      ],
    });
    const data = parseSpectrumFile(npes);
    expect(data.counts).toEqual([1, 2, 3]);
  });

  it('should route iOS rcspg JSON to parseSpectrogramIosRcspg', () => {
    const data = parseSpectrumFile(IOS_RCSPG);
    expect(data.sampleName).toBe('2026-04-19 20-15-08');
    expect(data.counts).toHaveLength(1024);
    expect(data.counts.reduce((a, b) => a + b, 0)).toBe(298037);
  });

  it('should parse CSV content with filename metadata', () => {
    const csv = ['0,0', '1,5', '2,10'].join('\n');
    const data = parseSpectrumFile(csv, 'Spectrum_2021-05-12_13-5355_100s.csv');
    expect(data.counts).toEqual([0, 5, 10]);
    expect(data.measurementTime).toBe(100);
  });

  it('should accept an ArrayBuffer for text formats (UTF-8 decode)', () => {
    const encoder = new TextEncoder();
    const bytes = encoder.encode(CS137_RCSPG);
    const data = parseSpectrumFile(bytes.buffer as ArrayBuffer);
    expect(data.sampleName).toBe('Cs-137');
    expect(data.counts).toHaveLength(1024);
  });

  it('should unzip a zrcspg and parse the inner rcspg', () => {
    const inner = new TextEncoder().encode(CS137_RCSPG);
    const archive = buildStoredZip('Spectrogram_Cs-137.rcspg', inner);
    const data = parseSpectrumFile(archive, 'Spectrogram_Cs-137.zrcspg');
    expect(data.sampleName).toBe('Cs-137');
    expect(data.counts).toHaveLength(1024);
  });

  it('should throw on unknown format', () => {
    expect(() => parseSpectrumFile('not a spectrum')).toThrow();
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
