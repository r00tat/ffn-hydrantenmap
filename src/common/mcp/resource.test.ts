import { describe, expect, it } from 'vitest';
import { matchesResource, normalizeResource } from './resource';

describe('normalizeResource', () => {
  it('entfernt Fragment und Trailing Slash', () => {
    expect(normalizeResource('https://karte.example/api/mcp#frag')).toBe(
      'https://karte.example/api/mcp',
    );
    expect(normalizeResource('https://karte.example/api/mcp/')).toBe(
      'https://karte.example/api/mcp',
    );
  });

  it('lässt Unsinn unverändert, bis auf den Trailing Slash', () => {
    expect(normalizeResource('kein-uri/')).toBe('kein-uri');
  });
});

describe('matchesResource', () => {
  const resource = 'https://karte.example/api/mcp';

  it('trifft trotz Trailing Slash und Fragment', () => {
    expect(matchesResource('https://karte.example/api/mcp/', resource)).toBe(
      true,
    );
    expect(matchesResource('https://karte.example/api/mcp#x', resource)).toBe(
      true,
    );
  });

  it('trifft nicht bei fremdem Resource Server', () => {
    expect(matchesResource('https://evil.example/api/mcp', resource)).toBe(
      false,
    );
  });

  it('trifft nicht bei fehlendem Wert', () => {
    expect(matchesResource(undefined, resource)).toBe(false);
    expect(matchesResource(null, resource)).toBe(false);
    expect(matchesResource('', resource)).toBe(false);
  });
});
