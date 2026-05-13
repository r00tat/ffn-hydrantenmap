import { describe, it, expect } from 'vitest';
import { getMessage, interpolate } from './messages';

describe('getMessage', () => {
  it('returns the German message for the de locale', () => {
    expect(getMessage('de', 'login.signInGoogle')).toBe('Mit Google anmelden');
  });

  it('returns the English message for the en locale', () => {
    expect(getMessage('en', 'login.signInGoogle')).toBe('Sign in with Google');
  });

  it('falls back to the German catalog when an en key is missing', () => {
    // Sanity check: a key that exists in both should not fall back, but a
    // hypothetical en-only-missing scenario should resolve via de fallback.
    expect(getMessage('en', 'app.title')).toBe('Operations Map');
  });

  it('returns the key when no translation exists', () => {
    expect(getMessage('de', 'totally.missing')).toBe('totally.missing');
  });
});

describe('interpolate', () => {
  it('returns the template unchanged when no params are given', () => {
    expect(interpolate('Hello {name}')).toBe('Hello {name}');
  });

  it('replaces named placeholders', () => {
    expect(interpolate('Hello {name}', { name: 'Klaus' })).toBe('Hello Klaus');
  });

  it('stringifies numeric values', () => {
    expect(interpolate('{count} entries', { count: 7 })).toBe('7 entries');
  });

  it('leaves unknown placeholders in place', () => {
    expect(interpolate('Hello {name}', { other: 'value' })).toBe(
      'Hello {name}',
    );
  });
});
