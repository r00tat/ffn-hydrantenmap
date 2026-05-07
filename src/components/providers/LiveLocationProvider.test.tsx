// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, render } from '@testing-library/react';
import React from 'react';
import type { GeoPositionObject } from '../../common/geo';
import type { PositionInfo } from '../../hooks/usePosition';

// --- Mocks ---------------------------------------------------------------

vi.mock('../firebase/firebase', () => ({
  default: {},
  firestore: { type: 'mock-firestore' },
}));

vi.mock('firebase/firestore', () => ({
  doc: vi.fn(() => ({ type: 'mock-doc-ref' })),
  serverTimestamp: vi.fn(() => ({ type: 'mock-server-ts' })),
  Timestamp: {
    fromMillis: vi.fn((ms: number) => ({ type: 'mock-timestamp', ms })),
  },
}));

vi.mock('../../lib/firestoreClient', () => ({
  setDoc: vi.fn(() => Promise.resolve()),
  deleteDoc: vi.fn(() => Promise.resolve()),
}));

const nativeStartLiveShare = vi.fn((_opts: unknown) => Promise.resolve());
const nativeStopLiveShare = vi.fn(() => Promise.resolve());
const isNativeGpsTrackingAvailable = vi.fn(() => false);

vi.mock('../../hooks/recording/nativeGpsTrackBridge', () => ({
  isNativeGpsTrackingAvailable: () => isNativeGpsTrackingAvailable(),
  nativeStartLiveShare: (opts: unknown) => nativeStartLiveShare(opts),
  nativeStopLiveShare: () => nativeStopLiveShare(),
}));

// PositionContext / useFirecall(Id) / useFirebaseLogin are all simple
// hooks we can swap with controllable mocks.
const positionState = {
  position: { lat: 47.9, lng: 16.85 } as GeoPositionObject,
  isPositionSet: true,
  location: undefined as GeolocationPosition | undefined,
};
function getPositionInfo(): PositionInfo {
  return [
    positionState.position,
    positionState.isPositionSet,
    positionState.location,
    () => {},
    false,
  ];
}
vi.mock('./PositionProvider', () => ({
  __esModule: true,
  default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  PositionProvider: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
  usePositionContext: () => getPositionInfo(),
}));

const loginState = {
  uid: 'user-1' as string | undefined,
  email: 'paul@example.com' as string | undefined,
  displayName: 'Paul Wölfel' as string | undefined,
};
vi.mock('../../hooks/useFirebaseLogin', () => ({
  __esModule: true,
  default: () => ({ ...loginState }),
}));

const firecallState = {
  id: 'fc-A',
  name: 'Brand B7',
};
vi.mock('../../hooks/useFirecall', () => ({
  __esModule: true,
  default: () => ({ id: firecallState.id, name: firecallState.name }),
  useFirecall: () => ({ id: firecallState.id, name: firecallState.name }),
  useFirecallId: () => firecallState.id,
}));

// useLiveLocationSettings is fine to use as-is — but we don't want it to
// touch localStorage between tests, so reset before each test.

// --- Imports under test --------------------------------------------------
import {
  LiveLocationProvider,
  useLiveLocationContext,
} from './LiveLocationProvider';

// --- Helpers -------------------------------------------------------------

function Probe({
  onValue,
}: {
  onValue: (v: ReturnType<typeof useLiveLocationContext>) => void;
}) {
  const ctx = useLiveLocationContext();
  onValue(ctx);
  return <div data-testid="sharing">{ctx.isSharing ? 'on' : 'off'}</div>;
}

function renderProvider() {
  const values: ReturnType<typeof useLiveLocationContext>[] = [];
  const utils = render(
    <LiveLocationProvider>
      <Probe onValue={(v) => values.push(v)} />
    </LiveLocationProvider>,
  );
  return { ...utils, values };
}

// --- Tests ---------------------------------------------------------------

describe('LiveLocationProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    isNativeGpsTrackingAvailable.mockReturnValue(false);
    positionState.position = { lat: 47.9, lng: 16.85 };
    positionState.isPositionSet = true;
    positionState.location = undefined;
    loginState.uid = 'user-1';
    loginState.email = 'paul@example.com';
    loginState.displayName = 'Paul Wölfel';
    firecallState.id = 'fc-A';
    firecallState.name = 'Brand B7';
    if (typeof window !== 'undefined') {
      window.localStorage.clear();
    }
  });

  it('mounts with isSharing=false and exposes settings + canShare', () => {
    const { values } = renderProvider();
    const ctx = values.at(-1)!;
    expect(ctx.isSharing).toBe(false);
    expect(typeof ctx.start).toBe('function');
    expect(typeof ctx.stop).toBe('function');
    expect(ctx.canShare).toBe(true);
    expect(ctx.settings.heartbeatMs).toBeGreaterThan(0);
    expect(ctx.settings.distanceM).toBeGreaterThan(0);
  });

  it('throws when used outside provider', () => {
    const Consumer = () => {
      useLiveLocationContext();
      return null;
    };
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => render(<Consumer />)).toThrow(/LiveLocationProvider/);
    errSpy.mockRestore();
  });

  it('start() flips isSharing to true; stop() flips it back', async () => {
    const { values } = renderProvider();

    await act(async () => {
      await values.at(-1)!.start();
    });
    expect(values.at(-1)!.isSharing).toBe(true);

    await act(async () => {
      await values.at(-1)!.stop();
    });
    expect(values.at(-1)!.isSharing).toBe(false);
  });

  it('canShare is false when uid missing', () => {
    loginState.uid = undefined;
    const { values } = renderProvider();
    expect(values.at(-1)!.canShare).toBe(false);
  });

  it('canShare is false when firecallId is "unknown"', () => {
    firecallState.id = 'unknown';
    const { values } = renderProvider();
    expect(values.at(-1)!.canShare).toBe(false);
  });

  it('canShare is false when no position is set', () => {
    positionState.isPositionSet = false;
    const { values } = renderProvider();
    expect(values.at(-1)!.canShare).toBe(false);
  });

  it('start() does nothing when no firecall is selected', async () => {
    firecallState.id = 'unknown';
    const { values } = renderProvider();
    await act(async () => {
      await values.at(-1)!.start();
    });
    expect(values.at(-1)!.isSharing).toBe(false);
    expect(nativeStartLiveShare).not.toHaveBeenCalled();
  });

  it('calls native bridge start when native tracking is available', async () => {
    isNativeGpsTrackingAvailable.mockReturnValue(true);
    const { values } = renderProvider();
    await act(async () => {
      await values.at(-1)!.start();
    });
    expect(nativeStartLiveShare).toHaveBeenCalledTimes(1);
    const opts = nativeStartLiveShare.mock.calls[0][0] as unknown as {
      firecallId: string;
      uid: string;
      firecallName: string;
    };
    expect(opts.firecallId).toBe('fc-A');
    expect(opts.uid).toBe('user-1');
    expect(opts.firecallName).toBe('Brand B7');
  });

  it('calls native bridge stop on stop() when native tracking is available', async () => {
    isNativeGpsTrackingAvailable.mockReturnValue(true);
    const { values } = renderProvider();
    await act(async () => {
      await values.at(-1)!.start();
    });
    await act(async () => {
      await values.at(-1)!.stop();
    });
    expect(nativeStopLiveShare).toHaveBeenCalled();
  });

  it('does NOT call native bridge when not available', async () => {
    isNativeGpsTrackingAvailable.mockReturnValue(false);
    const { values } = renderProvider();
    await act(async () => {
      await values.at(-1)!.start();
    });
    await act(async () => {
      await values.at(-1)!.stop();
    });
    expect(nativeStartLiveShare).not.toHaveBeenCalled();
    expect(nativeStopLiveShare).not.toHaveBeenCalled();
  });
});
