import { describe, expect, it } from 'vitest';
import {
  clampExpiry,
  expiryFromPreset,
  MAX_SHARE_LINK_DURATION_MS,
  shareLinkStatus,
  type FirecallShareLink,
} from './firecallShareLink';

const NOW = Date.UTC(2026, 7, 12, 12, 0, 0);

function link(overrides: Partial<FirecallShareLink> = {}): FirecallShareLink {
  return {
    uid: 'guest-uid',
    name: 'Nachbarwehr Weiden',
    canWrite: false,
    disabled: false,
    expiresAt: NOW + 60_000,
    ...overrides,
  };
}

describe('shareLinkStatus', () => {
  it('is active while the expiry is in the future', () => {
    expect(shareLinkStatus(link(), NOW)).toBe('active');
  });

  it('is expired without an expiry date — guests from before this feature', () => {
    expect(shareLinkStatus(link({ expiresAt: undefined }), NOW)).toBe('expired');
  });

  it('is expired the moment the expiry is reached', () => {
    expect(shareLinkStatus(link({ expiresAt: NOW }), NOW)).toBe('expired');
  });

  it('is disabled when the user is not authorized', () => {
    expect(shareLinkStatus(link({ disabled: true }), NOW)).toBe('disabled');
  });

  it('reports expired for a link that is both disabled and expired', () => {
    expect(
      shareLinkStatus(link({ disabled: true, expiresAt: NOW - 1 }), NOW)
    ).toBe('expired');
  });
});

describe('expiryFromPreset', () => {
  it('adds one day', () => {
    expect(expiryFromPreset('1d', NOW)).toBe(NOW + 24 * 60 * 60 * 1000);
  });

  it('adds seven days', () => {
    expect(expiryFromPreset('7d', NOW)).toBe(NOW + 7 * 24 * 60 * 60 * 1000);
  });

  it('adds thirty days', () => {
    expect(expiryFromPreset('30d', NOW)).toBe(NOW + 30 * 24 * 60 * 60 * 1000);
  });

  it('has no fixed duration for a custom date', () => {
    expect(() => expiryFromPreset('custom', NOW)).toThrow();
  });
});

describe('clampExpiry', () => {
  it('keeps a date within the allowed range', () => {
    expect(clampExpiry(NOW + 5_000, NOW)).toBe(NOW + 5_000);
  });

  it('caps at one year', () => {
    expect(clampExpiry(NOW + MAX_SHARE_LINK_DURATION_MS * 2, NOW)).toBe(
      NOW + MAX_SHARE_LINK_DURATION_MS
    );
  });

  it('rejects a date in the past', () => {
    expect(() => clampExpiry(NOW - 1, NOW)).toThrow();
  });
});
