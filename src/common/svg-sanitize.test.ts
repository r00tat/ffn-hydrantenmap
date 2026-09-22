import { describe, expect, it } from 'vitest';
import { escapeXml, sanitizeHexColor, svgSecurityHeaders } from './svg-sanitize';

describe('escapeXml', () => {
  it('escapes all XML special characters', () => {
    expect(escapeXml('<script>alert("xss")</script>')).toBe(
      '&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;'
    );
  });

  it('escapes ampersands', () => {
    expect(escapeXml('a&b')).toBe('a&amp;b');
  });

  it('escapes single quotes', () => {
    expect(escapeXml("it's")).toBe('it&apos;s');
  });

  it('returns empty string unchanged', () => {
    expect(escapeXml('')).toBe('');
  });

  it('leaves safe strings unchanged', () => {
    expect(escapeXml('FW Neusiedl')).toBe('FW Neusiedl');
  });
});

describe('sanitizeHexColor', () => {
  it('accepts valid 6-digit hex colors', () => {
    expect(sanitizeHexColor('#ff0000', '#000')).toBe('#ff0000');
    expect(sanitizeHexColor('#0000ff', '#000')).toBe('#0000ff');
  });

  it('accepts valid 3-digit hex colors', () => {
    expect(sanitizeHexColor('#f00', '#000')).toBe('#f00');
  });

  it('rejects non-hex values and returns default', () => {
    expect(sanitizeHexColor('red', '#000')).toBe('#000');
    expect(sanitizeHexColor('"><script>alert(1)</script>', '#000')).toBe('#000');
    expect(sanitizeHexColor('rgb(0,0,0)', '#000')).toBe('#000');
  });

  it('rejects colors without hash prefix', () => {
    expect(sanitizeHexColor('ff0000', '#000')).toBe('#000');
  });

  it('accepts hex colors with an alpha channel', () => {
    // Der Farbwähler des Elementdialogs (`MuiColorInput`, `format="hex8"`)
    // liefert acht Stellen. Ohne sie fiele jede dort gewählte Farbe auf den
    // Vorgabewert zurück.
    expect(sanitizeHexColor('#ff00ff80', '#000')).toBe('#ff00ff80');
    expect(sanitizeHexColor('#f00a', '#000')).toBe('#f00a');
  });

  it('rejects hex strings of an invalid length', () => {
    // Gültig sind 3, 4, 6 und 8 Stellen — alles dazwischen ist keine Farbe.
    expect(sanitizeHexColor('#ff00f', '#000')).toBe('#000');
    expect(sanitizeHexColor('#ff00ff0', '#000')).toBe('#000');
    expect(sanitizeHexColor('#ff00ff001', '#000')).toBe('#000');
  });
});

describe('svgSecurityHeaders', () => {
  it('includes Content-Type for SVG', () => {
    expect(svgSecurityHeaders['Content-Type']).toBe('image/svg+xml');
  });

  it('includes restrictive CSP header', () => {
    expect(svgSecurityHeaders['Content-Security-Policy']).toBe(
      "default-src 'none'"
    );
  });
});
