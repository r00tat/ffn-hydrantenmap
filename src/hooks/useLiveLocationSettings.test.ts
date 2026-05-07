// @vitest-environment jsdom
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
    // Reference the remaining bound constants to keep them part of the public surface.
    expect(HEARTBEAT_MAX_MS).toBeGreaterThan(HEARTBEAT_MIN_MS);
    expect(DISTANCE_MIN_M).toBeLessThan(DISTANCE_MAX_M);
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
