import { describe, expect, it } from 'vitest';
import {
  isAllowedRedirectUri,
  isLoopbackRedirectUri,
  isPrivateUseRedirectUri,
  matchRedirectUri,
} from './redirectUri';

describe('isAllowedRedirectUri', () => {
  it('nimmt HTTPS', () => {
    expect(isAllowedRedirectUri('https://claude.ai/api/callback')).toBe(true);
  });

  it('weist HTTP auf einem fremden Host ab', () => {
    expect(isAllowedRedirectUri('http://claude.ai/callback')).toBe(false);
  });

  it('nimmt Loopback, auch ohne Port', () => {
    // Claude Code registriert genau so — ohne Port, weil der erst zur Laufzeit
    // feststeht (RFC 8252 Abschnitt 7.3).
    expect(isAllowedRedirectUri('http://127.0.0.1:8080/cb')).toBe(true);
    expect(isAllowedRedirectUri('http://localhost:1455/cb')).toBe(true);
    expect(isAllowedRedirectUri('http://localhost/callback')).toBe(true);
    expect(isAllowedRedirectUri('http://127.0.0.1/callback')).toBe(true);
  });

  it('nimmt Private-Use-Schemata', () => {
    expect(isAllowedRedirectUri('at.ff-neusiedl.karte:/cb')).toBe(true);
  });

  it('weist javascript: ab', () => {
    // Kein Punkt im Schema — sonst wäre jedes Skript ein Redirect-Ziel.
    expect(isAllowedRedirectUri('javascript:alert(1)')).toBe(false);
  });

  it('weist HTTP auf einem Host ab, der nur wie Loopback aussieht', () => {
    expect(isAllowedRedirectUri('http://localhost.evil.example/cb')).toBe(
      false,
    );
    expect(isAllowedRedirectUri('http://127.0.0.1.evil.example/cb')).toBe(
      false,
    );
  });

  it('weist eine URI mit Fragment ab', () => {
    expect(isAllowedRedirectUri('https://claude.ai/cb#x')).toBe(false);
  });

  it('weist Unsinn ab', () => {
    expect(isAllowedRedirectUri('kein-uri')).toBe(false);
  });
});

describe('isLoopbackRedirectUri', () => {
  it('erkennt die drei Loopback-Schreibweisen', () => {
    expect(isLoopbackRedirectUri('http://127.0.0.1:1/cb')).toBe(true);
    expect(isLoopbackRedirectUri('http://localhost:1/cb')).toBe(true);
    expect(isLoopbackRedirectUri('http://[::1]:1/cb')).toBe(true);
  });

  it('ist kein Loopback über HTTPS-Fremdhost', () => {
    expect(isLoopbackRedirectUri('https://example.com/cb')).toBe(false);
  });
});

describe('isPrivateUseRedirectUri', () => {
  it('verlangt einen Punkt im Schema', () => {
    expect(isPrivateUseRedirectUri('com.example.app:/cb')).toBe(true);
    expect(isPrivateUseRedirectUri('myapp:/cb')).toBe(false);
  });
});

describe('matchRedirectUri', () => {
  const registered = [
    'https://claude.ai/api/mcp/auth_callback',
    'http://127.0.0.1:1455/callback',
  ];

  it('trifft exakt', () => {
    expect(
      matchRedirectUri('https://claude.ai/api/mcp/auth_callback', registered),
    ).toBe('https://claude.ai/api/mcp/auth_callback');
  });

  it('trifft nicht bei abweichendem Pfad', () => {
    expect(
      matchRedirectUri('https://claude.ai/api/mcp/other', registered),
    ).toBeUndefined();
  });

  it('trifft nicht bei abweichendem Host', () => {
    expect(
      matchRedirectUri('https://evil.example/api/mcp/auth_callback', registered),
    ).toBeUndefined();
  });

  it('ignoriert den Port bei Loopback', () => {
    expect(matchRedirectUri('http://127.0.0.1:54321/callback', registered)).toBe(
      'http://127.0.0.1:54321/callback',
    );
  });

  it('ignoriert den Port nur bei gleichem Pfad', () => {
    expect(
      matchRedirectUri('http://127.0.0.1:54321/anders', registered),
    ).toBeUndefined();
  });

  it('ignoriert den Port nur bei gleichem Loopback-Host', () => {
    expect(
      matchRedirectUri('http://localhost:54321/callback', registered),
    ).toBeUndefined();
  });
});
