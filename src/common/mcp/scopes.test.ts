import { describe, expect, it } from 'vitest';
import {
  coversScopes,
  DEFAULT_MCP_SCOPES,
  formatScopes,
  hasAnyScope,
  hasScopes,
  isMcpScope,
  parseScopes,
  parseScopesStrict,
} from './scopes';

describe('parseScopes', () => {
  it('zerlegt einen leerzeichengetrennten scope-Parameter', () => {
    expect(parseScopes('einsatz:read berechnung')).toEqual([
      'einsatz:read',
      'berechnung',
    ]);
  });

  it('verwirft unbekannte Werte still', () => {
    expect(parseScopes('einsatz:read admin:everything')).toEqual([
      'einsatz:read',
    ]);
  });

  it('entfernt Duplikate und liefert kanonische Reihenfolge', () => {
    expect(parseScopes('berechnung einsatz:read einsatz:read')).toEqual([
      'einsatz:read',
      'berechnung',
    ]);
  });

  it('liefert für fehlende Angabe eine leere Liste', () => {
    expect(parseScopes(undefined)).toEqual([]);
    expect(parseScopes('')).toEqual([]);
    expect(parseScopes(null)).toEqual([]);
  });
});

describe('parseScopesStrict', () => {
  it('meldet unbekannte Werte gesondert', () => {
    expect(parseScopesStrict('einsatz:read fahrtenbuch:read')).toEqual({
      scopes: ['einsatz:read'],
      unknown: ['fahrtenbuch:read'],
    });
  });
});

describe('formatScopes', () => {
  it('schreibt kanonisch in der Reihenfolge von MCP_SCOPES', () => {
    expect(formatScopes(['berechnung', 'einsatz:read'])).toBe(
      'einsatz:read berechnung',
    );
  });
});

describe('hasScopes', () => {
  it('verlangt alle geforderten Scopes', () => {
    expect(hasScopes(['einsatz:read'], ['einsatz:read'])).toBe(true);
    expect(hasScopes(['einsatz:read'], ['einsatz:write'])).toBe(false);
    expect(
      hasScopes(['einsatz:read', 'einsatz:write'], [
        'einsatz:read',
        'einsatz:write',
      ]),
    ).toBe(true);
  });
});

describe('hasAnyScope', () => {
  it('reicht ein Treffer', () => {
    expect(hasAnyScope(['berechnung'], ['einsatz:read', 'berechnung'])).toBe(
      true,
    );
    expect(hasAnyScope(['berechnung'], ['einsatz:read'])).toBe(false);
  });
});

describe('coversScopes', () => {
  it('gilt nur, wenn der Consent die Anfrage vollständig abdeckt', () => {
    expect(coversScopes(['einsatz:read', 'berechnung'], ['einsatz:read'])).toBe(
      true,
    );
    expect(coversScopes(['einsatz:read'], ['einsatz:read', 'einsatz:write'])).toBe(
      false,
    );
  });
});

describe('DEFAULT_MCP_SCOPES', () => {
  it('enthält kein Schreibrecht', () => {
    expect(DEFAULT_MCP_SCOPES).not.toContain('einsatz:write');
  });
});

describe('isMcpScope', () => {
  it('erkennt bekannte Scopes', () => {
    expect(isMcpScope('einsatz:write')).toBe(true);
    expect(isMcpScope('fahrtenbuch:read')).toBe(false);
  });
});
