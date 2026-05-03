// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';

const setCrashlyticsUserIdMock = vi.hoisted(() => vi.fn(() => Promise.resolve()));

vi.mock('../components/firebase/crashlytics', () => ({
  setCrashlyticsUserId: setCrashlyticsUserIdMock,
}));

import useCrashlyticsUserSync from './useCrashlyticsUserSync';

interface Props {
  uid: string | undefined;
}

describe('useCrashlyticsUserSync', () => {
  beforeEach(() => {
    setCrashlyticsUserIdMock.mockClear();
  });

  it('forwards a defined uid to Crashlytics', () => {
    renderHook<void, Props>(({ uid }) => useCrashlyticsUserSync(uid), {
      initialProps: { uid: 'user-123' },
    });

    expect(setCrashlyticsUserIdMock).toHaveBeenCalledTimes(1);
    expect(setCrashlyticsUserIdMock).toHaveBeenCalledWith('user-123');
  });

  it('passes null when uid is undefined (signed-out state)', () => {
    renderHook<void, Props>(({ uid }) => useCrashlyticsUserSync(uid), {
      initialProps: { uid: undefined },
    });

    expect(setCrashlyticsUserIdMock).toHaveBeenCalledTimes(1);
    expect(setCrashlyticsUserIdMock).toHaveBeenCalledWith(null);
  });

  it('does not re-call when uid stays the same across renders', () => {
    const { rerender } = renderHook<void, Props>(
      ({ uid }) => useCrashlyticsUserSync(uid),
      { initialProps: { uid: 'user-123' } },
    );

    rerender({ uid: 'user-123' });
    rerender({ uid: 'user-123' });

    expect(setCrashlyticsUserIdMock).toHaveBeenCalledTimes(1);
  });

  it('updates Crashlytics when uid changes (sign-in -> sign-out -> sign-in)', () => {
    const { rerender } = renderHook<void, Props>(
      ({ uid }) => useCrashlyticsUserSync(uid),
      { initialProps: { uid: 'user-a' } },
    );

    rerender({ uid: undefined });
    rerender({ uid: 'user-b' });

    expect(setCrashlyticsUserIdMock).toHaveBeenCalledTimes(3);
    expect(setCrashlyticsUserIdMock).toHaveBeenNthCalledWith(1, 'user-a');
    expect(setCrashlyticsUserIdMock).toHaveBeenNthCalledWith(2, null);
    expect(setCrashlyticsUserIdMock).toHaveBeenNthCalledWith(3, 'user-b');
  });
});
