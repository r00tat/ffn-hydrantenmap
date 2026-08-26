import { describe, expect, it } from 'vitest';
import {
  deriveCodeChallenge,
  isValidCodeVerifier,
  timingSafeEqualString,
  verifyCodeChallenge,
} from './pkce';

const VERIFIER = 'a'.repeat(43);

describe('deriveCodeChallenge', () => {
  it('entspricht dem Beispiel aus RFC 7636 Anhang B', () => {
    expect(
      deriveCodeChallenge('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk'),
    ).toBe('E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM');
  });
});

describe('isValidCodeVerifier', () => {
  it('nimmt 43 bis 128 erlaubte Zeichen', () => {
    expect(isValidCodeVerifier('a'.repeat(43))).toBe(true);
    expect(isValidCodeVerifier('a'.repeat(128))).toBe(true);
  });

  it('weist zu kurze, zu lange und unerlaubte Verifier ab', () => {
    expect(isValidCodeVerifier('a'.repeat(42))).toBe(false);
    expect(isValidCodeVerifier('a'.repeat(129))).toBe(false);
    expect(isValidCodeVerifier(`${'a'.repeat(42)}!`)).toBe(false);
  });
});

describe('verifyCodeChallenge', () => {
  it('akzeptiert den passenden Verifier', () => {
    expect(
      verifyCodeChallenge(VERIFIER, deriveCodeChallenge(VERIFIER), 'S256'),
    ).toBe(true);
  });

  it('weist einen falschen Verifier ab', () => {
    expect(
      verifyCodeChallenge('b'.repeat(43), deriveCodeChallenge(VERIFIER), 'S256'),
    ).toBe(false);
  });

  it('weist die Methode plain ab', () => {
    expect(verifyCodeChallenge(VERIFIER, VERIFIER, 'plain')).toBe(false);
  });

  it('weist einen fehlenden Verifier ab', () => {
    expect(
      verifyCodeChallenge(undefined, deriveCodeChallenge(VERIFIER), 'S256'),
    ).toBe(false);
  });

  it('weist einen formal ungültigen Verifier ab, auch wenn der Hash passte', () => {
    const short = 'kurz';
    expect(verifyCodeChallenge(short, deriveCodeChallenge(short), 'S256')).toBe(
      false,
    );
  });
});

describe('timingSafeEqualString', () => {
  it('vergleicht auch unterschiedlich lange Zeichenketten', () => {
    expect(timingSafeEqualString('abc', 'abc')).toBe(true);
    expect(timingSafeEqualString('abc', 'abcd')).toBe(false);
  });
});
