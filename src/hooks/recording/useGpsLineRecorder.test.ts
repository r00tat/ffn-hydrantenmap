// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('server-only', () => ({}));

const nativeStart = vi.fn().mockResolvedValue(undefined);
const nativeStop = vi.fn().mockResolvedValue(undefined);
let nativeAvailable = true;

vi.mock('./nativeGpsTrackBridge', () => ({
  isNativeGpsTrackingAvailable: () => nativeAvailable,
  nativeStartGpsTrack: (...a: unknown[]) => nativeStart(...a),
  nativeStopGpsTrack: (...a: unknown[]) => nativeStop(...a),
}));

// The hook pulls in the firebase/leaflet/next-auth chain transitively. For the
// pure backend-decision helper we don't need any of that; stub the heavy
// modules so the file loads.
vi.mock('../../components/firebase/firebase', () => ({
  default: {},
  firebaseApp: {},
  firestore: {},
  db: {},
  auth: {},
}));
vi.mock('../useFirebaseLogin', () => ({
  default: () => ({ email: 'test@example.com' }),
}));
vi.mock('../useFirecall', () => ({
  useFirecallId: () => 'fc-test',
}));
vi.mock('../useFirecallItemAdd', () => ({
  default: () => async () => ({ id: 'stub' }),
}));
vi.mock('../useFirecallItemUpdate', () => ({
  default: () => async () => undefined,
}));

import { __testing_decideBackend } from './useGpsLineRecorder';

describe('useGpsLineRecorder backend selection', () => {
  beforeEach(() => {
    nativeStart.mockClear();
    nativeStop.mockClear();
  });

  it('uses native when available', () => {
    nativeAvailable = true;
    expect(__testing_decideBackend()).toBe('native');
  });

  it('uses web when not available', () => {
    nativeAvailable = false;
    expect(__testing_decideBackend()).toBe('web');
  });
});
