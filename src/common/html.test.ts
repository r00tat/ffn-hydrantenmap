import { describe, expect, it } from 'vitest';
import { escapeHtml } from './html';

describe('escapeHtml', () => {
  it('neutralises tag delimiters', () => {
    expect(escapeHtml('<img src=x onerror=alert(1)>')).toBe(
      '&lt;img src=x onerror=alert(1)&gt;',
    );
  });

  it('escapes both quote characters so attribute contexts hold', () => {
    expect(escapeHtml(`a"b'c`)).toBe('a&quot;b&#39;c');
  });

  it('escapes the ampersand first so entities are not double-decoded', () => {
    expect(escapeHtml('&lt;')).toBe('&amp;lt;');
  });

  it('leaves harmless text untouched', () => {
    expect(escapeHtml('Paul Wölfel (Android)')).toBe('Paul Wölfel (Android)');
  });

  it('handles the empty string', () => {
    expect(escapeHtml('')).toBe('');
  });
});
