import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import { generateShareLinkId, generateShareToken } from './shareToken';

describe('generateShareToken', () => {
  it('erzeugt 32 URL-sichere Zeichen', () => {
    const token = generateShareToken();
    expect(token).toHaveLength(32);
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it('erzeugt bei jedem Aufruf einen anderen Token', () => {
    const tokens = new Set(Array.from({ length: 200 }, () => generateShareToken()));
    expect(tokens.size).toBe(200);
  });
});

describe('generateShareLinkId', () => {
  it('erzeugt 12 hexadezimale Zeichen', () => {
    const linkId = generateShareLinkId();
    expect(linkId).toMatch(/^[0-9a-f]{12}$/);
  });

  it('erzeugt bei jedem Aufruf eine andere Kennung', () => {
    const ids = new Set(Array.from({ length: 200 }, () => generateShareLinkId()));
    expect(ids.size).toBe(200);
  });
});
