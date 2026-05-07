import { Timestamp } from 'firebase/firestore';

export const LIVE_LOCATION_COLLECTION_ID = 'livelocation';

export const STALE_FADE_START_MS = 2 * 60 * 1000; // 2 min
export const STALE_HARD_CUTOFF_MS = 5 * 60 * 1000; // 5 min
export const TTL_EXPIRY_MS = 60 * 60 * 1000; // 1 h (Firestore TTL)

export interface LiveLocation {
  uid: string;
  name: string;
  email: string;
  lat: number;
  lng: number;
  accuracy?: number;
  heading?: number;
  speed?: number;
  updatedAt: Timestamp;
  expiresAt: Timestamp;
}

const PALETTE = [
  '#1976d2',
  '#388e3c',
  '#d32f2f',
  '#f57c00',
  '#7b1fa2',
  '#0288d1',
  '#c2185b',
  '#5d4037',
  '#00796b',
  '#fbc02d',
  '#512da8',
  '#455a64',
];

export function pickAvatarColor(uid: string): string {
  let hash = 0;
  for (let i = 0; i < uid.length; i++) {
    hash = (hash * 31 + uid.charCodeAt(i)) | 0;
  }
  const idx = Math.abs(hash) % PALETTE.length;
  return PALETTE[idx];
}

const firstCodePoint = (s: string): string => {
  for (const ch of s) return ch;
  return '';
};

const firstCodePoints = (s: string, n: number): string => {
  const out: string[] = [];
  for (const ch of s) {
    out.push(ch);
    if (out.length >= n) break;
  }
  return out.join('');
};

export function computeInitials(name: string, email: string): string {
  const trimmed = name.trim();
  if (trimmed) {
    const parts = trimmed.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) {
      return (firstCodePoint(parts[0]) + firstCodePoint(parts[1])).toUpperCase();
    }
    const first = firstCodePoint(parts[0]);
    return first ? first.toUpperCase() : '?';
  }
  const local = (email.split('@')[0] || '').trim();
  if (local) {
    return firstCodePoints(local, 2).toUpperCase();
  }
  return '??';
}

export function isFresh(updatedAtMs: number, nowMs: number = Date.now()): boolean {
  return nowMs - updatedAtMs < STALE_HARD_CUTOFF_MS;
}

export function computeOpacity(
  updatedAtMs: number,
  nowMs: number = Date.now()
): number {
  const age = nowMs - updatedAtMs;
  if (age <= STALE_FADE_START_MS) return 1;
  if (age >= STALE_HARD_CUTOFF_MS) return 0;
  const fadeRange = STALE_HARD_CUTOFF_MS - STALE_FADE_START_MS;
  const fadeProgress = (age - STALE_FADE_START_MS) / fadeRange;
  return 1 - fadeProgress * 0.7; // 1.0 → 0.3 over fade range
}
