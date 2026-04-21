import { describe, expect, it } from 'vitest';
import { exportSpectrumXml } from './spectrumExporter';
import { parseSpectrumXml } from './spectrumParser';

const fixture = {
  sampleName: 'Testprobe',
  deviceName: 'RadiaCode-102',
  measurementTime: 600,
  liveTime: 598,
  startTime: '2026-04-21T10:00:00',
  endTime: '2026-04-21T10:10:00',
  coefficients: [0, 2.5, 0],
  counts: [0, 1, 4, 9, 16, 25, 16, 9, 4, 1, 0],
};

describe('exportSpectrumXml', () => {
  it('roundtrips through parseSpectrumXml without data loss', () => {
    const xml = exportSpectrumXml(fixture);
    const parsed = parseSpectrumXml(xml);
    expect(parsed.sampleName).toBe(fixture.sampleName);
    expect(parsed.deviceName).toBe(fixture.deviceName);
    expect(parsed.measurementTime).toBe(fixture.measurementTime);
    expect(parsed.liveTime).toBe(fixture.liveTime);
    expect(parsed.startTime).toBe(fixture.startTime);
    expect(parsed.endTime).toBe(fixture.endTime);
    expect(parsed.coefficients).toEqual(fixture.coefficients);
    expect(parsed.counts).toEqual(fixture.counts);
  });

  it('produces well-formed XML with ResultDataFile/ResultData root', () => {
    const xml = exportSpectrumXml(fixture);
    expect(xml).toMatch(/^<\?xml/);
    expect(xml).toContain('<ResultDataFile');
    expect(xml).toContain('<ResultData');
    expect(xml).toContain('<EnergySpectrum');
  });

  it('escapes XML-special characters in sampleName', () => {
    const xml = exportSpectrumXml({ ...fixture, sampleName: 'A&B<C>' });
    const parsed = parseSpectrumXml(xml);
    expect(parsed.sampleName).toBe('A&B<C>');
  });
});
