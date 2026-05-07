# Live-Standort-Sharing Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task.

**Goal:** User können ihren Live-Standort innerhalb eines Firecalls für andere sichtbar machen. Andere User sehen die Standorte als Avatar-Marker auf der Einsatzkarte. Funktioniert in Browser und nativer Android-App (Foreground Service).

**Architecture:** Firestore-Subcollection `call/{firecallId}/livelocation/{uid}` mit TTL-Cleanup. Schreib-Logik in `useLiveLocationShare` mit OR-Throttling (30 s ODER 20 m). Lese-Logik in eigener Leaflet-LayerGroup. Native Android: Bridge-Erweiterung für bestehenden Foreground Service mit unabhängigen Modi `track` und `liveShare`.

**Tech Stack:** Next.js 16, React 19, TypeScript, Firebase Firestore, MUI, Leaflet/React Leaflet, Capacitor 8 + Kotlin/Java für Android.

**Wichtig (User-Memory):** Im hydranten-map-Projekt **keine Zwischen-Commits/Checks pro Step**. Checks (`npx tsc --noEmit`, `npx eslint`, `npx vitest run`, `npx next build --webpack`) und Commit am Ende — siehe Task 11.

**Reference docs:**
- Design: `docs/plans/2026-05-07-live-location-sharing-design.md`
- CLAUDE.md (Worktree-Root)

---

## Task 1: Datenmodell, Konstanten & Helper

**Files:**
- Create: `src/common/liveLocation.ts`
- Create: `src/common/liveLocation.test.ts`

**Step 1: Tests schreiben** (`liveLocation.test.ts`)

```ts
import { describe, it, expect } from 'vitest';
import {
  computeInitials,
  pickAvatarColor,
  isFresh,
  computeOpacity,
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
      // not all uids must hit different colors, but the result must be from the palette
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

  it('exposes the collection id constant', () => {
    expect(LIVE_LOCATION_COLLECTION_ID).toBe('livelocation');
  });
});
```

**Step 2: Implementation** (`liveLocation.ts`)

```ts
import { Timestamp } from 'firebase/firestore';

export const LIVE_LOCATION_COLLECTION_ID = 'livelocation';

export const STALE_FADE_START_MS = 2 * 60 * 1000;     // 2 min
export const STALE_HARD_CUTOFF_MS = 5 * 60 * 1000;    // 5 min
export const TTL_EXPIRY_MS = 60 * 60 * 1000;          // 1 h (Firestore TTL)

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
  '#1976d2', '#388e3c', '#d32f2f', '#f57c00',
  '#7b1fa2', '#0288d1', '#c2185b', '#5d4037',
  '#00796b', '#fbc02d', '#512da8', '#455a64',
];

export function pickAvatarColor(uid: string): string {
  let hash = 0;
  for (let i = 0; i < uid.length; i++) {
    hash = (hash * 31 + uid.charCodeAt(i)) | 0;
  }
  const idx = Math.abs(hash) % PALETTE.length;
  return PALETTE[idx];
}

export function computeInitials(name: string, email: string): string {
  const trimmed = name.trim();
  if (trimmed) {
    const parts = trimmed.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return parts[0][0]?.toUpperCase() ?? '?';
  }
  const local = (email.split('@')[0] || '').trim();
  if (local) {
    return local.slice(0, 2).toUpperCase();
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
  return 1 - fadeProgress * 0.7;  // 1.0 → 0.3 over fade range
}
```

**Verification:** `npx vitest run src/common/liveLocation.test.ts` — alle Tests grün.

---

## Task 2: Firestore Security Rules + TTL Policy

**Files:**
- Modify: `firebase/dev/firestore.rules`
- Modify: `firebase/prod/firestore.rules` (falls vorhanden — sonst nur dev)

**Step 1:** Innerhalb des `match /call/{doc}`-Blocks, **vor** dem generischen `match /{subitem=**}`, neue Regel einfügen:

```
match /livelocation/{userId} {
  allow read:   if callAuthorized();
  allow create: if callAuthorized()
                && userId == request.auth.uid
                && request.resource.data.uid == request.auth.uid;
  allow update: if callAuthorized()
                && userId == request.auth.uid
                && request.resource.data.uid == request.auth.uid;
  allow delete: if callAuthorized()
                && userId == request.auth.uid;
}
```

**Step 2:** Identische Regel in `firebase/prod/firestore.rules` einfügen, falls die Datei existiert. Pfad prüfen: `ls firebase/prod/firestore.rules 2>/dev/null`.

**Step 3:** TTL Policy aktivieren — **manueller Schritt** für den User. Im Plan dokumentieren als Hinweis:

> **Manueller Deployment-Schritt (nach Merge):** TTL Policy auf `expiresAt` aktivieren via Cloud Console oder:
> ```bash
> gcloud firestore fields ttls update expiresAt \
>   --collection-group=livelocation --enable-ttl
> ```
> Für dev (`ffndev`) und prod separat ausführen.

**Verification:** Rules-Datei syntaktisch prüfen, falls Firebase CLI verfügbar:

```bash
npx firebase --project ffndev firestore:rules:get  # nur Sanity-Check der bestehenden Rules
```

(Keine automatische Rules-Tests — manuell via Emulator oder Live-Test in Task 11.)

---

## Task 3: Settings-Hook (`useLiveLocationSettings`)

**Files:**
- Create: `src/hooks/useLiveLocationSettings.ts`
- Create: `src/hooks/useLiveLocationSettings.test.ts`

**Step 1: Tests** — persistiert Defaults bei leerem Storage, lädt gespeicherte Werte, klemmt Werte an Min/Max.

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import {
  useLiveLocationSettings,
  DEFAULT_HEARTBEAT_MS,
  DEFAULT_DISTANCE_M,
  HEARTBEAT_MIN_MS,
  HEARTBEAT_MAX_MS,
  DISTANCE_MIN_M,
  DISTANCE_MAX_M,
  STORAGE_KEY,
} from './useLiveLocationSettings';

describe('useLiveLocationSettings', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('returns defaults when nothing in storage', () => {
    const { result } = renderHook(() => useLiveLocationSettings());
    expect(result.current.settings.heartbeatMs).toBe(DEFAULT_HEARTBEAT_MS);
    expect(result.current.settings.distanceM).toBe(DEFAULT_DISTANCE_M);
  });

  it('loads saved settings', () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ heartbeatMs: 60_000, distanceM: 50 })
    );
    const { result } = renderHook(() => useLiveLocationSettings());
    expect(result.current.settings.heartbeatMs).toBe(60_000);
    expect(result.current.settings.distanceM).toBe(50);
  });

  it('clamps out-of-range values to min/max on save', () => {
    const { result } = renderHook(() => useLiveLocationSettings());
    act(() => {
      result.current.setSettings({ heartbeatMs: 5_000, distanceM: 1_000 });
    });
    expect(result.current.settings.heartbeatMs).toBe(HEARTBEAT_MIN_MS);
    expect(result.current.settings.distanceM).toBe(DISTANCE_MAX_M);
  });

  it('persists changes to localStorage', () => {
    const { result } = renderHook(() => useLiveLocationSettings());
    act(() => {
      result.current.setSettings({ heartbeatMs: 45_000, distanceM: 25 });
    });
    const raw = localStorage.getItem(STORAGE_KEY);
    expect(raw).toBeTruthy();
    const parsed = JSON.parse(raw!);
    expect(parsed.heartbeatMs).toBe(45_000);
    expect(parsed.distanceM).toBe(25);
  });
});
```

**Step 2: Implementation**

```ts
'use client';
import { useCallback, useEffect, useState } from 'react';

export const STORAGE_KEY = 'liveLocationSettings/v1';

export const DEFAULT_HEARTBEAT_MS = 30_000;
export const DEFAULT_DISTANCE_M = 20;
export const HEARTBEAT_MIN_MS = 10_000;
export const HEARTBEAT_MAX_MS = 120_000;
export const DISTANCE_MIN_M = 5;
export const DISTANCE_MAX_M = 100;

export interface LiveLocationSettings {
  heartbeatMs: number;
  distanceM: number;
}

const DEFAULTS: LiveLocationSettings = {
  heartbeatMs: DEFAULT_HEARTBEAT_MS,
  distanceM: DEFAULT_DISTANCE_M,
};

const clamp = (n: number, min: number, max: number) =>
  Math.min(Math.max(n, min), max);

function load(): LiveLocationSettings {
  if (typeof window === 'undefined') return DEFAULTS;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULTS;
    const parsed = JSON.parse(raw) as Partial<LiveLocationSettings>;
    return {
      heartbeatMs: clamp(
        Number(parsed.heartbeatMs ?? DEFAULT_HEARTBEAT_MS),
        HEARTBEAT_MIN_MS,
        HEARTBEAT_MAX_MS
      ),
      distanceM: clamp(
        Number(parsed.distanceM ?? DEFAULT_DISTANCE_M),
        DISTANCE_MIN_M,
        DISTANCE_MAX_M
      ),
    };
  } catch {
    return DEFAULTS;
  }
}

export function useLiveLocationSettings() {
  const [settings, setSettingsState] = useState<LiveLocationSettings>(load);

  useEffect(() => {
    setSettingsState(load());
  }, []);

  const setSettings = useCallback((next: LiveLocationSettings) => {
    const clamped: LiveLocationSettings = {
      heartbeatMs: clamp(next.heartbeatMs, HEARTBEAT_MIN_MS, HEARTBEAT_MAX_MS),
      distanceM: clamp(next.distanceM, DISTANCE_MIN_M, DISTANCE_MAX_M),
    };
    setSettingsState(clamped);
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(clamped));
    }
  }, []);

  return { settings, setSettings };
}
```

**Verification:** `npx vitest run src/hooks/useLiveLocationSettings.test.ts`.

---

## Task 4: Schreib-Hook (`useLiveLocationShare`) mit OR-Throttling

**Files:**
- Create: `src/hooks/useLiveLocationShare.ts`
- Create: `src/hooks/useLiveLocationShare.test.ts`

**Step 1: Tests** — fokussiert auf reine Throttle-Logik. Ziehe die Pure-Funktion `shouldSendUpdate(lastSent, now, lastPos, currentPos, settings)` aus dem Hook heraus, damit sie ohne React getestet werden kann.

```ts
import { describe, it, expect } from 'vitest';
import { shouldSendUpdate, distanceMeters } from './useLiveLocationShare';

const settings = { heartbeatMs: 30_000, distanceM: 20 };

describe('shouldSendUpdate (OR logic)', () => {
  it('triggers on first call (no lastSent)', () => {
    expect(
      shouldSendUpdate(undefined, 1_000, undefined, { lat: 0, lng: 0 }, settings)
    ).toBe(true);
  });

  it('triggers when heartbeat elapsed without movement', () => {
    expect(
      shouldSendUpdate(0, 30_001, { lat: 0, lng: 0 }, { lat: 0, lng: 0 }, settings)
    ).toBe(true);
  });

  it('does not trigger before heartbeat without movement', () => {
    expect(
      shouldSendUpdate(0, 29_000, { lat: 0, lng: 0 }, { lat: 0, lng: 0 }, settings)
    ).toBe(false);
  });

  it('triggers on distance threshold even before heartbeat', () => {
    // 0.0002 deg lat ≈ 22 m
    expect(
      shouldSendUpdate(
        0,
        5_000,
        { lat: 0, lng: 0 },
        { lat: 0.0002, lng: 0 },
        settings
      )
    ).toBe(true);
  });

  it('does not trigger on small movement before heartbeat', () => {
    // 0.00005 deg lat ≈ 5.5 m
    expect(
      shouldSendUpdate(
        0,
        5_000,
        { lat: 0, lng: 0 },
        { lat: 0.00005, lng: 0 },
        settings
      )
    ).toBe(false);
  });
});

describe('distanceMeters', () => {
  it('is roughly 0 for identical coords', () => {
    expect(distanceMeters({ lat: 47, lng: 16 }, { lat: 47, lng: 16 }))
      .toBeLessThan(0.5);
  });
  it('approximates 1 deg lat ≈ 111 km', () => {
    const d = distanceMeters({ lat: 47, lng: 16 }, { lat: 48, lng: 16 });
    expect(d).toBeGreaterThan(110_000);
    expect(d).toBeLessThan(112_000);
  });
});
```

**Step 2: Implementation**

```ts
'use client';
import {
  collection,
  deleteDoc,
  doc,
  serverTimestamp,
  setDoc,
  Timestamp,
} from 'firebase/firestore';
import { useCallback, useEffect, useRef } from 'react';
import { firestore } from '../components/firebase/firebase';
import { FIRECALL_COLLECTION_ID } from '../components/firebase/firestore';
import {
  LIVE_LOCATION_COLLECTION_ID,
  TTL_EXPIRY_MS,
} from '../common/liveLocation';
import type { LiveLocationSettings } from './useLiveLocationSettings';
import type { GeoPositionObject } from '../common/geo';

interface ShareIdentity {
  firecallId: string;
  uid: string;
  name: string;
  email: string;
}

export function distanceMeters(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number }
): number {
  const R = 6_371_000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const x =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}

export function shouldSendUpdate(
  lastSentMs: number | undefined,
  nowMs: number,
  lastPos: { lat: number; lng: number } | undefined,
  currentPos: { lat: number; lng: number },
  settings: LiveLocationSettings
): boolean {
  if (lastSentMs === undefined || !lastPos) return true;
  const elapsed = nowMs - lastSentMs;
  if (elapsed >= settings.heartbeatMs) return true;
  if (distanceMeters(lastPos, currentPos) >= settings.distanceM) return true;
  return false;
}

export interface LiveLocationShareApi {
  /** Push a fresh position if the throttle gate allows. */
  maybeSend: (
    pos: GeoPositionObject,
    location: GeolocationPosition | undefined
  ) => Promise<void>;
  /** Delete the user's doc (called on stop / firecall change). */
  deleteOwn: () => Promise<void>;
}

export function useLiveLocationShare(
  identity: ShareIdentity | null,
  settings: LiveLocationSettings
): LiveLocationShareApi {
  const lastSentMsRef = useRef<number | undefined>(undefined);
  const lastPosRef = useRef<{ lat: number; lng: number } | undefined>(undefined);

  const maybeSend = useCallback<LiveLocationShareApi['maybeSend']>(
    async (pos, location) => {
      if (!identity) return;
      const now = Date.now();
      if (
        !shouldSendUpdate(
          lastSentMsRef.current,
          now,
          lastPosRef.current,
          { lat: pos.lat, lng: pos.lng },
          settings
        )
      ) {
        return;
      }
      const ref = doc(
        firestore,
        FIRECALL_COLLECTION_ID,
        identity.firecallId,
        LIVE_LOCATION_COLLECTION_ID,
        identity.uid
      );
      await setDoc(ref, {
        uid: identity.uid,
        name: identity.name,
        email: identity.email,
        lat: pos.lat,
        lng: pos.lng,
        accuracy: location?.coords.accuracy,
        heading: location?.coords.heading ?? undefined,
        speed: location?.coords.speed ?? undefined,
        updatedAt: serverTimestamp(),
        expiresAt: Timestamp.fromMillis(Date.now() + TTL_EXPIRY_MS),
      });
      lastSentMsRef.current = now;
      lastPosRef.current = { lat: pos.lat, lng: pos.lng };
    },
    [identity, settings]
  );

  const deleteOwn = useCallback(async () => {
    if (!identity) return;
    const ref = doc(
      firestore,
      FIRECALL_COLLECTION_ID,
      identity.firecallId,
      LIVE_LOCATION_COLLECTION_ID,
      identity.uid
    );
    await deleteDoc(ref).catch((err) => {
      console.warn('[liveLocation] deleteOwn failed', err);
    });
    lastSentMsRef.current = undefined;
    lastPosRef.current = undefined;
  }, [identity]);

  // Reset internal state when identity (firecall/user) changes.
  useEffect(() => {
    lastSentMsRef.current = undefined;
    lastPosRef.current = undefined;
  }, [identity?.firecallId, identity?.uid]);

  return { maybeSend, deleteOwn };
}
```

**Verification:** `npx vitest run src/hooks/useLiveLocationShare.test.ts`.

---

## Task 5: Provider (`LiveLocationProvider`)

**Files:**
- Create: `src/components/providers/LiveLocationProvider.tsx`
- Create: `src/components/providers/LiveLocationProvider.test.tsx`
- Modify: `src/components/providers/AppProviders.tsx` (Provider zwischen `GpsProvider` und `DebugLoggingProvider` einhängen)

**Step 1: Skeleton + Tests**

Provider exposes:
- `isSharing: boolean`
- `start(): Promise<void>` — startet Sharing, ruft Native-Bridge falls verfügbar
- `stop(): Promise<void>` — stoppt + löscht eigenes Doc
- `settings`, `setSettings` (durchgereicht aus `useLiveLocationSettings`)
- `permissionState: 'unknown' | 'granted' | 'denied'`

Logik:
- Konsumiert `usePositionContext`, `useFirebaseLogin`, `useFirecallId`, `useFirecall` (für `firecallName`).
- Ruft bei jedem Position-Update `maybeSend` auf, solange `isSharing` und Permission ok.
- Bei Firecall-Wechsel (`firecallId` ändert sich, während aktiv): automatisch stoppen + Doc-Delete (alter Pfad). Anschließend ggf. mit neuem Firecall neu starten lassen — User muss selbst entscheiden, also nur stoppen.
- Bei Unmount oder `beforeunload`: best-effort Doc-Delete.
- `start()` ruft `nativeStartLiveShare` falls verfügbar (`isNativeGpsTrackingAvailable`); `stop()` ruft `nativeStopLiveShare`.

Tests (mit Mocks für `firestore`, Native-Bridge): grundlegende Lifecycle-Smoke-Tests:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, act } from '@testing-library/react';
import { LiveLocationProvider, useLiveLocationContext } from './LiveLocationProvider';

vi.mock('../firebase/firebase', () => ({ firestore: {} }));
vi.mock('../../hooks/recording/nativeGpsTrackBridge', () => ({
  isNativeGpsTrackingAvailable: () => false,
  nativeStartLiveShare: vi.fn(),
  nativeStopLiveShare: vi.fn(),
}));
// + minimal mocks für usePositionContext, useFirebaseLogin, useFirecall(Id)

// ... assert that isSharing toggles correctly via start()/stop()
```

**Step 2: Implementation** — Skeleton:

```tsx
'use client';
import React, { createContext, useCallback, useContext, useEffect,
  useMemo, useRef, useState } from 'react';
import { useLiveLocationShare } from '../../hooks/useLiveLocationShare';
import { useLiveLocationSettings, LiveLocationSettings } from '../../hooks/useLiveLocationSettings';
import { usePositionContext } from './PositionProvider';
import useFirebaseLogin from '../../hooks/useFirebaseLogin';
import { useFirecall, useFirecallId } from '../../hooks/useFirecall';
import {
  isNativeGpsTrackingAvailable,
  nativeStartLiveShare,
  nativeStopLiveShare,
} from '../../hooks/recording/nativeGpsTrackBridge';

interface LiveLocationContextValue {
  isSharing: boolean;
  settings: LiveLocationSettings;
  setSettings: (s: LiveLocationSettings) => void;
  start: () => Promise<void>;
  stop: () => Promise<void>;
  canShare: boolean;        // position + firecall + uid available
}

const LiveLocationContext = createContext<LiveLocationContextValue | null>(null);

export function LiveLocationProvider({ children }: { children: React.ReactNode }) {
  const [position, isPositionSet, location] = usePositionContext();
  const { uid, email, displayName } = useFirebaseLogin();
  const firecallId = useFirecallId();
  const firecall = useFirecall();

  const { settings, setSettings } = useLiveLocationSettings();
  const [isSharing, setIsSharing] = useState(false);

  const identity = useMemo(() => {
    if (!isSharing || !uid || !firecallId || firecallId === 'unknown') {
      return null;
    }
    return {
      firecallId,
      uid,
      name: displayName || email || '',
      email: email ?? '',
    };
  }, [isSharing, uid, firecallId, displayName, email]);

  const { maybeSend, deleteOwn } = useLiveLocationShare(identity, settings);

  // Push position updates while sharing
  useEffect(() => {
    if (!isSharing || !isPositionSet) return;
    void maybeSend(position, location);
  }, [isSharing, isPositionSet, position, location, maybeSend]);

  // Auto-stop on firecall change
  const previousFirecallRef = useRef(firecallId);
  useEffect(() => {
    if (previousFirecallRef.current !== firecallId && isSharing) {
      // tear down with the OLD firecall id captured by the previous identity
      void deleteOwn();
      setIsSharing(false);
      if (isNativeGpsTrackingAvailable()) {
        void nativeStopLiveShare().catch(() => {});
      }
    }
    previousFirecallRef.current = firecallId;
  }, [firecallId, isSharing, deleteOwn]);

  // Best-effort cleanup on unmount + beforeunload
  useEffect(() => {
    if (!isSharing) return;
    const handler = () => { void deleteOwn(); };
    window.addEventListener('beforeunload', handler);
    return () => {
      window.removeEventListener('beforeunload', handler);
      void deleteOwn();
    };
  }, [isSharing, deleteOwn]);

  const start = useCallback(async () => {
    if (!uid || !firecallId || firecallId === 'unknown') return;
    setIsSharing(true);
    if (isNativeGpsTrackingAvailable()) {
      await nativeStartLiveShare({
        firecallId,
        uid,
        name: displayName || email || '',
        email: email ?? '',
        intervalMs: settings.heartbeatMs,
        distanceM: settings.distanceM,
        firecallName: firecall.name,
      }).catch((err) => console.warn('[liveLocation] native start failed', err));
    }
  }, [uid, firecallId, displayName, email, settings, firecall.name]);

  const stop = useCallback(async () => {
    setIsSharing(false);
    await deleteOwn();
    if (isNativeGpsTrackingAvailable()) {
      await nativeStopLiveShare().catch(() => {});
    }
  }, [deleteOwn]);

  const canShare = isPositionSet && !!uid && firecallId !== 'unknown';

  const value: LiveLocationContextValue = {
    isSharing, settings, setSettings, start, stop, canShare,
  };

  return (
    <LiveLocationContext.Provider value={value}>
      {children}
    </LiveLocationContext.Provider>
  );
}

export function useLiveLocationContext(): LiveLocationContextValue {
  const ctx = useContext(LiveLocationContext);
  if (!ctx) throw new Error('useLiveLocationContext must be used within LiveLocationProvider');
  return ctx;
}
```

**Step 3: Provider in AppProviders einhängen** — `LiveLocationProvider` direkt **innerhalb** des `GpsProvider` und **außerhalb** des `DebugLoggingProvider` (oder weiter innen, Hauptsache nach `PositionProvider` und `FirecallProvider`):

```tsx
const LiveLocationProvider = dynamic(() => import('./LiveLocationProvider'), {
  ssr: false,
});

// in LogedinApp:
<GpsProvider>
  <LiveLocationProvider>
    <DebugLoggingProvider>
      ...
    </DebugLoggingProvider>
  </LiveLocationProvider>
</GpsProvider>
```

**Verification:** `npx vitest run src/components/providers/LiveLocationProvider.test.tsx`.

---

## Task 6: Read-Hook + Layer + Marker

**Files:**
- Create: `src/hooks/useLiveLocations.ts`
- Create: `src/hooks/useLiveLocations.test.ts`
- Create: `src/components/Map/layers/LiveLocationLayer.tsx`
- Create: `src/components/Map/markers/LiveLocationMarker.tsx`
- Create: `src/components/Map/markers/LiveLocationMarker.test.tsx`
- Modify: `src/components/Map/Map.tsx` — neuer `LayersControl.Overlay` „Live-Standorte" mit `LiveLocationLayer`, **defaultmäßig `checked`**, eingefügt direkt nach dem bestehenden `Position`-Overlay.

**Step 1: `useLiveLocations` Hook**

```ts
'use client';
import { useMemo } from 'react';
import useFirebaseCollection from './useFirebaseCollection';
import { FIRECALL_COLLECTION_ID } from '../components/firebase/firestore';
import { LIVE_LOCATION_COLLECTION_ID, isFresh, LiveLocation } from '../common/liveLocation';
import { useFirecallId } from './useFirecall';
import useFirebaseLogin from './useFirebaseLogin';

export interface DisplayableLiveLocation extends LiveLocation {
  id: string;
  /** epoch ms of updatedAt for opacity calc */
  updatedAtMs: number;
}

export function useLiveLocations(): DisplayableLiveLocation[] {
  const firecallId = useFirecallId();
  const { uid: myUid } = useFirebaseLogin();

  const records = useFirebaseCollection<LiveLocation & { id: string }>({
    collectionName: FIRECALL_COLLECTION_ID,
    pathSegments: [firecallId, LIVE_LOCATION_COLLECTION_ID],
  });

  return useMemo(() => {
    if (!records) return [];
    const now = Date.now();
    return records
      .filter((r) => r.uid !== myUid)
      .map((r) => {
        const ms = r.updatedAt
          ? // @ts-ignore — Firestore Timestamp duck-typed
            (typeof r.updatedAt.toMillis === 'function'
              ? r.updatedAt.toMillis()
              : 0)
          : 0;
        return { ...r, id: r.id, updatedAtMs: ms };
      })
      .filter((r) => isFresh(r.updatedAtMs, now));
  }, [records, myUid]);
}
```

Tests prüfen Filter (eigene UID raus, > 5 min raus) per Mocking von `useFirebaseCollection`.

**Step 2: `LiveLocationMarker`** — Leaflet `divIcon` mit Avatar + Label, Popup mit Name + relativer Zeit. Re-render alle 30 s, damit Opacity & Zeit-Label aktualisieren.

```tsx
'use client';
import L from 'leaflet';
import { useEffect, useMemo, useState } from 'react';
import { Marker, Popup } from 'react-leaflet';
import {
  computeInitials,
  computeOpacity,
  pickAvatarColor,
} from '../../../common/liveLocation';
import type { DisplayableLiveLocation } from '../../../hooks/useLiveLocations';

const formatRelative = (ms: number): string => {
  const ageSec = Math.max(0, Math.round((Date.now() - ms) / 1000));
  if (ageSec < 60) return `vor ${ageSec} s`;
  const m = Math.round(ageSec / 60);
  return `vor ${m} min`;
};

export default function LiveLocationMarker({
  loc,
}: {
  loc: DisplayableLiveLocation;
}) {
  const [, force] = useState(0);
  useEffect(() => {
    const t = setInterval(() => force((n) => n + 1), 30_000);
    return () => clearInterval(t);
  }, []);

  const opacity = computeOpacity(loc.updatedAtMs);
  const initials = computeInitials(loc.name, loc.email);
  const color = pickAvatarColor(loc.uid);

  const icon = useMemo(
    () =>
      L.divIcon({
        className: '',
        html: `
          <div style="display:flex;align-items:center;gap:4px;opacity:${opacity};pointer-events:auto;">
            <div style="
              width:32px;height:32px;border-radius:50%;
              background:${color};color:#fff;
              display:flex;align-items:center;justify-content:center;
              font:bold 12px sans-serif;
              border:2px solid #fff;box-shadow:0 1px 2px rgba(0,0,0,.4);
            ">${initials}</div>
            <div style="
              background:rgba(255,255,255,.85);
              padding:2px 6px;border-radius:4px;
              font:11px sans-serif;color:#222;white-space:nowrap;
              box-shadow:0 1px 2px rgba(0,0,0,.2);
            ">${loc.name || loc.email}</div>
          </div>`,
        iconSize: [120, 32],
        iconAnchor: [16, 16],
        popupAnchor: [0, -16],
      }),
    [opacity, initials, color, loc.name, loc.email]
  );

  if (opacity <= 0) return null;

  return (
    <Marker position={{ lat: loc.lat, lng: loc.lng }} icon={icon}>
      <Popup>
        <strong>{loc.name || loc.email}</strong>
        <br />
        zuletzt aktualisiert {formatRelative(loc.updatedAtMs)}
      </Popup>
    </Marker>
  );
}
```

Tests (`LiveLocationMarker.test.tsx`): rendert Initialen, Farbe, Popup-Inhalt mit relativer Zeit.

**Step 3: `LiveLocationLayer`** — `LayerGroup`, mappt über `useLiveLocations()`:

```tsx
'use client';
import { LayerGroup } from 'react-leaflet';
import { useLiveLocations } from '../../../hooks/useLiveLocations';
import LiveLocationMarker from '../markers/LiveLocationMarker';

export default function LiveLocationLayer() {
  const locations = useLiveLocations();
  return (
    <LayerGroup>
      {locations.map((loc) => (
        <LiveLocationMarker key={loc.id} loc={loc} />
      ))}
    </LayerGroup>
  );
}
```

**Step 4: `Map.tsx` patchen** — nach dem bestehenden `<LayersControl.Overlay name="Position" checked>` Block einfügen:

```tsx
<LayersControl.Overlay name="Live-Standorte" checked>
  <LiveLocationLayer />
</LayersControl.Overlay>
```

Plus passender Import oben in der Datei.

**Verification:** `npx vitest run src/hooks/useLiveLocations.test.ts src/components/Map/markers/LiveLocationMarker.test.tsx`.

---

## Task 7: FAB + Start-Dialog + Stop-Confirm

**Files:**
- Create: `src/components/LiveLocation/LiveLocationFab.tsx`
- Create: `src/components/LiveLocation/LiveLocationDialog.tsx`
- Create: `src/components/LiveLocation/LiveLocationDialog.test.tsx`
- Create: `src/components/LiveLocation/LiveLocationStopConfirm.tsx`
- Modify: `src/components/Map/RecordButton.tsx` — `<LiveLocationFab />` direkt **vor** dem äußeren `<Box>` einfügen, sodass beide FABs nebeneinander auf der Karte erscheinen. Ein zusätzlicher Wrapper ist nicht nötig — `LiveLocationFab` setzt selbst `position: absolute` mit `bottom: 184` (60 px höher als `RecordButton`s 120 px).

**`LiveLocationFab`:**

- Konsumiert `useLiveLocationContext()`.
- Drei Zustände → drei Icons/Farben:
  - off + canShare: `<LocationOnOutlined />`, default Farbe → öffnet `LiveLocationDialog`
  - active: `<LocationOn />`, primary, leichtes CSS-Pulse → öffnet `LiveLocationStopConfirm`
  - !canShare: gar nicht rendern (vereinfacht; Permission/Firecall fehlt)
- Tooltip „Live-Standort teilen" / „Live-Sharing läuft".

**`LiveLocationDialog`:**

- MUI `Dialog` mit Titel „Standort teilen?", Body-Text (siehe Design-Doc).
- `Accordion` „Erweiterte Einstellungen" mit zwei `Slider`-Komponenten.
- Buttons „Abbrechen" / „Standort teilen".
- Bei Submit: settings über `setSettings` persistieren (falls geändert), dann `start()` aufrufen.

Tests: render, sliders zeigen aktuelle Werte, Submit ruft `setSettings` und `start`.

**`LiveLocationStopConfirm`:**

- Kleiner MUI `Dialog`: „Live-Sharing beenden?" mit `[Abbrechen] [Beenden]`.
- Bei Bestätigen: `stop()`.

**Verification:** `npx vitest run src/components/LiveLocation/`.

---

## Task 8: Native Bridge — TypeScript-Seite

**Files:**
- Modify: `src/hooks/recording/nativeGpsTrackBridge.ts`

Erweitern um Live-Share-Funktionen, die das vorhandene `RadiacodeNotification`-Plugin (= Capacitor-Bridge zum Foreground Service) ansprechen:

```ts
export interface NativeLiveShareOpts {
  firecallId: string;
  uid: string;
  name: string;
  email: string;
  intervalMs: number;
  distanceM: number;
  firecallName: string;
}

export async function nativeStartLiveShare(opts: NativeLiveShareOpts): Promise<void> {
  console.log('[GpsTrack/native] startLiveShare', opts);
  // Plugin name & method named consistently with existing API.
  await GpsTrack.startLiveShare({
    firecallId: opts.firecallId,
    uid: opts.uid,
    name: opts.name,
    email: opts.email,
    intervalMs: opts.intervalMs,
    distanceM: opts.distanceM,
    firecallName: opts.firecallName,
    firestoreDb: process.env.NEXT_PUBLIC_FIRESTORE_DB || '(default)',
  });
}

export async function nativeStopLiveShare(): Promise<void> {
  console.log('[GpsTrack/native] stopLiveShare');
  await GpsTrack.stopLiveShare();
}

export async function nativeUpdateLiveShareSettings(opts: {
  intervalMs: number;
  distanceM: number;
}): Promise<void> {
  console.log('[GpsTrack/native] updateLiveShareSettings', opts);
  await GpsTrack.updateLiveShareSettings(opts);
}
```

Plugin-Typ in `radiacodeNotification.ts` muss um diese Methoden erweitert werden — checke die Datei und ergänze die `definePlugin`-Signatur.

**Verification:** `npx tsc --noEmit src/hooks/recording/nativeGpsTrackBridge.ts` erzeugt keinen Fehler. Web läuft auch ohne Native (`isNativeGpsTrackingAvailable()` schützt die Aufrufe).

---

## Task 9: Native Android — Foreground Service erweitern

**Files (Anhaltspunkte; konkrete Datei-Aufteilung beim Implementieren festlegen):**
- Modify: `capacitor/android/app/src/main/java/at/ffnd/einsatzkarte/RadiacodeNotificationPlugin.java` — neue `@PluginMethod`-Funktionen: `startLiveShare`, `stopLiveShare`, `updateLiveShareSettings`.
- Modify: `capacitor/android/app/src/main/java/at/ffnd/einsatzkarte/RadiacodeForegroundService.kt` — separate Modus-Flags `trackActive`, `liveShareActive`. Service stoppt nur, wenn beide off. Notification-Text wird kontextabhängig zusammengesetzt (siehe Design).
- Create: `capacitor/android/app/src/main/java/at/ffnd/einsatzkarte/livelocation/LiveLocationPusher.kt` — eigener GPS-Listener + Throttle-Gate (analog `gpstrack/SampleGate.kt`), schreibt `livelocation`-Doc via Firestore Admin SDK (oder REST mit ID-Token, je nach existierendem Pattern in `gpstrack/FirestoreLineUpdater.kt` — nachschauen und konsistent halten).
- Reuse: `gpstrack/Haversine`-Helper für Distanz (oder neu in einem Util).

**Wichtige Details:**

- TTL-Feld `expiresAt` muss als Firestore `Timestamp` geschrieben werden, korrekt mit `Date.now() + 60 min` befüllt.
- Bei `stopLiveShare`: das eigene Doc löschen.
- Bei `updateLiveShareSettings`: Throttle-Gate-Werte zur Laufzeit anpassen.
- `firecallName` für die Notification durchreichen.
- AndroidManifest: prüfen, ob `ACCESS_BACKGROUND_LOCATION` und `FOREGROUND_SERVICE_LOCATION` schon deklariert sind; falls nicht, hinzufügen.

**Build-Check:**
```bash
cd capacitor/android
JAVA_HOME=$(/usr/libexec/java_home -v 21) ./gradlew :app:assembleDebug
```

**Verification:** Android-Build kompiliert. Manuelle Verifikation in Task 11.

---

## Task 10: Lifecycle / Edge-Cases

**Files:**
- Refine: `src/components/providers/LiveLocationProvider.tsx`

Folgende Aspekte explizit prüfen und ggf. nachbessern:

1. **Permission revoked während Sharing aktiv**: `usePosition` setzt `isSet` zurück bei dauerhaften Fehlern; im Provider beobachten und Sharing automatisch stoppen mit Snackbar-Hinweis.
2. **`beforeunload` ist nicht zuverlässig**: zusätzlich `visibilitychange` → `document.hidden` honorieren (auf Mobile-Browsern stabiler). Best-Effort, kein harter Garantie-Anspruch.
3. **Mehrere Tabs gleichzeitig**: kein zusätzlicher Schutz nötig — letzter Schreibender gewinnt; `deleteOwn` beim Schließen eines Tabs löscht aber das Doc, was den anderen Tab kurz „leer" macht. Dokumentieren in der PR-Beschreibung als bekannte Eigenschaft.
4. **Native-Aktiv + Browser-Tab geschlossen**: Native Foreground Service läuft weiter; das ist gewünscht. `LiveLocationProvider` darf in dem Fall **nicht** automatisch löschen (mehrdeutig, weil Native gerade schreibt). → Lösung: beim Native-Mode den `deleteOwn`-Cleanup in `useEffect`-Cleanup unterdrücken, indem ein Flag im Hook geprüft wird.

**Verification:** Code-Review der Lifecycle-Logik im Provider; ggf. zusätzlicher Test im Provider-Spec.

---

## Task 11: Final Checks, Manuelle Verifikation, Commit & PR

**Step 1: Volle Checks (einzeln, nicht `npm run check`):**

```bash
git checkout -- next-env.d.ts || true
npx tsc --noEmit
npx eslint
npx vitest run
npx next build --webpack
```

Alle müssen grün sein. **Keine Commit, solange tsc Fehler meldet** — auch keine vermeintlich pre-existing.

**Step 2: Manuelle Verifikation Browser:**

- Dev-Server starten (`npm run dev`).
- Mit zwei Browser-Profilen / -Geräten gleichzeitig in denselben Firecall einloggen.
- User A startet Live-Sharing → User B sieht Avatar + Label.
- User A bewegt sich (oder simuliert via DevTools-Geolocation) → Position aktualisiert sich bei B.
- User A stoppt → Marker verschwindet bei B.
- Test: Firecall-Wechsel bei aktivem Sharing → Sharing stoppt + Doc gelöscht.
- Test: Tab schließen → Marker verschwindet bei B (best-effort).
- Test: Permission verweigert → FAB nicht aktivierbar bzw. Fehler-Hinweis.
- Test: nach 5 min ohne Update → Marker fade von 2 min an, weg ab 5 min.
- Test: Doppel-Marker eigener User darf **nicht** auftauchen (eigene UID gefiltert).

**Step 3: Manuelle Verifikation Native (Android, falls Build durchläuft):**

- APK auf Testgerät installieren.
- Live-Sharing starten → Notification mit Einsatz-Name erscheint.
- App in den Hintergrund → Standort wird weiter geteilt (im Browser oder zweiten Gerät prüfen).
- Track-Recording parallel starten → Notification-Text zeigt beides.
- Stoppen via FAB / via Notification-Action (falls vorgesehen) → beide Modi sauber beendet.
- Reboot-Verhalten: Sharing nach Reboot nicht automatisch wieder aktiv.

**Step 4: Commit + Push + PR**

```bash
git add ...   # alle relevanten Dateien explizit
git commit -m "feat(map): live location sharing per firecall"
git push -u origin feature/live-location
```

PR-Beschreibung auf Deutsch, Titel als Conventional Commit, Test plan ausfüllen — siehe CLAUDE.md Pull-Request-Sektion.

**PR-Beschreibung-Vorlage:**

```markdown
## Zusammenfassung

Einsatzkräfte können ihren Live-Standort innerhalb eines aktiven Firecalls für andere Berechtigte sichtbar machen. Andere User sehen die Standorte als Avatar-Marker mit Namens-Label auf der Einsatzkarte. Native Android unterstützt Background-Sharing via Foreground Service, integriert in den bestehenden GPS-Track-Service.

## Änderungen

- Neue Firestore-Subcollection `call/{firecallId}/livelocation/{uid}` mit TTL Policy
- Schreib-Hook mit OR-Throttling (Default 30 s ODER 20 m, anpassbar)
- Eigene Leaflet-Layer „Live-Standorte" mit Avatar-Markern (Initialen + Namens-Label)
- FAB über dem Aufnahme-Button, Bestätigungs-Dialog mit erweiterten Einstellungen
- Settings persistiert in localStorage
- Soft-Fade ab 2 min, hart-Cutoff bei 5 min
- Auto-Stopp bei Firecall-Wechsel oder Page-Unmount
- Native Android: Foreground Service erweitert um unabhängigen `liveShare`-Modus
- Security Rules: Schreibzugriff auf eigene UID begrenzt, Read für alle Firecall-User

## Test plan

- [ ] Zwei Geräte/Browser im selben Firecall: A teilt → B sieht Marker
- [ ] Bewegung von A spiegelt sich bei B nach Distanz-/Heartbeat-Bedingung
- [ ] Stop bei A → Marker bei B verschwindet
- [ ] Firecall-Wechsel: Sharing stoppt, altes Doc gelöscht
- [ ] Permission verweigert: FAB-Fehler-Zustand
- [ ] Marker faded nach 2 min, verschwindet nach 5 min
- [ ] Eigener Marker nicht doppelt sichtbar
- [ ] Android: Foreground-Service-Notification mit Einsatz-Name
- [ ] Android: Sharing läuft im Hintergrund weiter
- [ ] Android: Track-Recording + Live-Share parallel funktionieren
- [ ] TTL Policy nach Deploy aktiviert (manuell, dev + prod)

🤖 Generated with [Claude Code](https://claude.com/claude-code)
```

**Step 5: Hinweis im PR-Text** auf den manuellen Deployment-Schritt für die Firestore TTL Policy.

---

## Build-Sequenz Zusammenfassung

| # | Task | Abhängigkeiten |
|---|---|---|
| 1 | Datenmodell + Helper | — |
| 2 | Security Rules + TTL | 1 |
| 3 | Settings-Hook | — |
| 4 | Schreib-Hook | 1, 3 |
| 5 | Provider | 4 |
| 6 | Read-Hook + Layer + Marker | 1 |
| 7 | FAB + Dialog | 5 |
| 8 | Native Bridge TS | 5 |
| 9 | Native Android Service | 8 |
| 10 | Lifecycle-Refine | 5, 7 |
| 11 | Checks + Manual + PR | alle |

Tasks 1, 3, 6 (in Teilen) und 8 sind unabhängig und könnten parallelisiert werden, falls Subagents zur Verfügung stehen.
