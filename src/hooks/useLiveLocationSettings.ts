'use client';
import { useCallback, useState } from 'react';

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
