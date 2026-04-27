import { describe, it, expect } from 'vitest';
import { markerIconDataUrl, vehicleIconDataUrl } from './markerSvg';

function decode(dataUrl: string): string {
  const prefix = 'data:image/svg+xml;utf8,';
  expect(dataUrl.startsWith(prefix)).toBe(true);
  return decodeURIComponent(dataUrl.slice(prefix.length));
}

describe('markerIconDataUrl', () => {
  it('returns a data URL with the requested fill color', () => {
    const svg = decode(markerIconDataUrl('#abcdef'));
    expect(svg).toContain('fill="#abcdef"');
    expect(svg).toMatch(/^<svg /);
  });

  it('falls back to the default color for invalid input', () => {
    const svg = decode(markerIconDataUrl('javascript:alert(1)'));
    expect(svg).toContain('fill="#0000ff"');
    expect(svg).not.toContain('javascript');
  });

  it('falls back to the default color when input is empty', () => {
    const svg = decode(markerIconDataUrl(''));
    expect(svg).toContain('fill="#0000ff"');
  });
});

describe('vehicleIconDataUrl', () => {
  it('embeds the vehicle name and FW', () => {
    const svg = decode(vehicleIconDataUrl({ name: 'TLF-A', fw: 'FFN' }));
    expect(svg).toContain('TLF-A');
    expect(svg).toContain('FFN');
  });

  it('escapes XML special characters in name and fw', () => {
    const svg = decode(
      vehicleIconDataUrl({ name: '<bad>&"', fw: "it's" })
    );
    expect(svg).not.toContain('<bad>');
    expect(svg).toContain('&lt;bad&gt;&amp;&quot;');
    expect(svg).toContain('&apos;');
  });

  it('clamps rotate to a valid integer in [0, 360)', () => {
    const svgA = decode(vehicleIconDataUrl({ name: 'A', fw: 'B', rotate: 720 }));
    expect(svgA).toContain('rotate(0)');

    const svgB = decode(vehicleIconDataUrl({ name: 'A', fw: 'B', rotate: 45 }));
    expect(svgB).toContain('rotate(45)');
  });

  it('defaults rotate to 0 when omitted or invalid', () => {
    const svgA = decode(vehicleIconDataUrl({ name: 'A', fw: 'B' }));
    expect(svgA).toContain('rotate(0)');

    const svgB = decode(
      vehicleIconDataUrl({ name: 'A', fw: 'B', rotate: Number.NaN })
    );
    expect(svgB).toContain('rotate(0)');
  });

  it('handles empty name and fw without crashing', () => {
    const svg = decode(vehicleIconDataUrl({ name: '', fw: '' }));
    expect(svg).toMatch(/^<svg /);
  });
});
