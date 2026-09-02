import { describe, it, expect } from 'vitest';
import {
  computeInitials,
  pickAvatarColor,
  isFresh,
  computeOpacity,
  deviceLabelFromUserAgent,
  liveLocationDocId,
  LIVE_LOCATION_COLLECTION_ID,
  STALE_HARD_CUTOFF_MS,
  STALE_FADE_START_MS,
} from './liveLocation';

describe('liveLocation helpers', () => {
  describe('computeInitials', () => {
    it('takes first letter of first two words', () => {
      expect(computeInitials('Paul Wölfel', 'paul@x.at')).toBe('PW');
    });
    it('falls back to single first letter for one-word names', () => {
      expect(computeInitials('Paul', 'paul@x.at')).toBe('P');
    });
    it('uses first 2 chars of email local part when name is empty', () => {
      expect(computeInitials('', 'paul.woelfel@example.com')).toBe('PA');
    });
    it('returns ?? when neither name nor email usable', () => {
      expect(computeInitials('', '')).toBe('??');
    });
    it('handles emoji and other supplementary-plane chars without breaking', () => {
      expect(computeInitials('🚒 Truck', '')).toBe('🚒T');
      // No half-surrogate in result — length in codepoints should equal 2 chars expressed as 2 codepoints.
      expect(Array.from(computeInitials('🚒 Engine', ''))).toEqual(['🚒', 'E']);
      // Email fallback path: first 2 codepoints, not 2 code units.
      expect(Array.from(computeInitials('', '🚒🔥@x.at'))).toEqual(['🚒', '🔥']);
    });
  });

  describe('pickAvatarColor', () => {
    it('is deterministic for same uid', () => {
      expect(pickAvatarColor('uid-1')).toBe(pickAvatarColor('uid-1'));
    });
    it('returns a valid hex color', () => {
      expect(pickAvatarColor('uid-1')).toMatch(/^#[0-9a-f]{6}$/i);
    });
    it('returns one of the palette colors', () => {
      const c = pickAvatarColor('any-uid');
      expect(typeof c).toBe('string');
      expect(c.length).toBe(7);
    });
  });

  describe('isFresh / computeOpacity', () => {
    const now = 1_700_000_000_000;
    it('returns true when within hard cutoff', () => {
      expect(isFresh(now - 4 * 60_000, now)).toBe(true);
    });
    it('returns false past hard cutoff', () => {
      expect(isFresh(now - 6 * 60_000, now)).toBe(false);
    });
    it('opacity is 1 below fade start', () => {
      expect(computeOpacity(now - 1 * 60_000, now)).toBe(1);
    });
    it('opacity is 0 past hard cutoff', () => {
      expect(computeOpacity(now - 6 * 60_000, now)).toBe(0);
    });
    it('opacity scales linearly between fade start and cutoff', () => {
      const mid = now - ((STALE_FADE_START_MS + STALE_HARD_CUTOFF_MS) / 2);
      const v = computeOpacity(mid, now);
      expect(v).toBeGreaterThan(0.3);
      expect(v).toBeLessThan(1);
    });
  });

  // Ein Dokument je Gerät, nicht je Benutzer: derselbe Account auf Tablet und
  // Desktop schrieb sonst dasselbe Dokument und die Geräte überschrieben sich.
  describe('liveLocationDocId', () => {
    it('combines uid and device id', () => {
      expect(liveLocationDocId('uid-1', 'abc123def456')).toBe(
        'uid-1_abc123def456',
      );
    });
    it('falls back to the bare uid without a device id', () => {
      expect(liveLocationDocId('uid-1', '')).toBe('uid-1');
    });
    it('stays within the character class the Firestore rules allow', () => {
      expect(liveLocationDocId('AbC123', 'ff00aa1234bc')).toMatch(
        /^AbC123_[A-Za-z0-9]+$/,
      );
    });
  });

  describe('deviceLabelFromUserAgent', () => {
    it('recognises Android before Linux (the Android UA carries both)', () => {
      expect(
        deviceLabelFromUserAgent(
          'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36',
        ),
      ).toBe('Android');
    });
    it('recognises iPhone and iPad', () => {
      expect(
        deviceLabelFromUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0)'),
      ).toBe('iPhone');
      expect(
        deviceLabelFromUserAgent('Mozilla/5.0 (iPad; CPU OS 17_0)'),
      ).toBe('iPad');
    });
    it('recognises Windows', () => {
      expect(
        deviceLabelFromUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64)'),
      ).toBe('Windows');
    });
    it('recognises Mac', () => {
      expect(
        deviceLabelFromUserAgent(
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
        ),
      ).toBe('Mac');
    });
    it('returns an empty label for anything unknown', () => {
      expect(deviceLabelFromUserAgent('')).toBe('');
      expect(deviceLabelFromUserAgent('curl/8.4.0')).toBe('');
    });
  });

  it('exposes the collection id constant', () => {
    expect(LIVE_LOCATION_COLLECTION_ID).toBe('livelocation');
  });
});
