import { describe, expect, it } from 'vitest';
import {
  isAllowedRedirectUri,
  isLoopbackRedirectUri,
  isPrivateUseRedirectUri,
  matchRedirectUri,
} from './redirectUri';

describe('isAllowedRedirectUri', () => {
  it('nimmt HTTPS für Web-Clients', () => {
    expect(isAllowedRedirectUri('https://claude.ai/api/callback', 'web')).toBe(
      true,
    );
  });

  it('weist HTTP für Web-Clients ab', () => {
    expect(isAllowedRedirectUri('http://claude.ai/callback', 'web')).toBe(false);
  });

  it('weist Loopback für Web-Clients ab', () => {
    expect(isAllowedRedirectUri('http://127.0.0.1:8080/cb', 'web')).toBe(false);
  });

  it('nimmt Loopback für native Clients', () => {
    expect(isAllowedRedirectUri('http://127.0.0.1:8080/cb', 'native')).toBe(
      true,
    );
    expect(isAllowedRedirectUri('http://localhost:1455/cb', 'native')).toBe(
      true,
    );
  });

  it('nimmt Private-Use-Schemata für native Clients', () => {
    expect(isAllowedRedirectUri('at.ff-neusiedl.karte:/cb', 'native')).toBe(
      true,
    );
  });

  it('weist javascript: auch für native Clients ab', () => {
    expect(isAllowedRedirectUri('javascript:alert(1)', 'native')).toBe(false);
  });

  it('weist eine URI mit Fragment ab', () => {
    expect(isAllowedRedirectUri('https://claude.ai/cb#x', 'web')).toBe(false);
  });

  it('weist Unsinn ab', () => {
    expect(isAllowedRedirectUri('kein-uri', 'web')).toBe(false);
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
