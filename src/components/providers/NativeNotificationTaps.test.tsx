// @vitest-environment jsdom
import { render, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  remove: vi.fn(),
  onUrl: undefined as ((url: string) => void) | undefined,
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mocks.push }),
}));

vi.mock('../../lib/nativeLocalNotifications', () => ({
  addNativeNotificationTapListener: vi.fn(async (onUrl: (url: string) => void) => {
    mocks.onUrl = onUrl;
    return mocks.remove;
  }),
}));

import NativeNotificationTaps from './NativeNotificationTaps';

describe('NativeNotificationTaps', () => {
  beforeEach(() => {
    mocks.push.mockClear();
    mocks.remove.mockClear();
    mocks.onUrl = undefined;
  });

  it('öffnet nach einem Tipp die Seite der Benachrichtigung', async () => {
    render(<NativeNotificationTaps />);
    await waitFor(() => expect(mocks.onUrl).toBeDefined());
    mocks.onUrl!('/einsatz/f1/atemschutzueberwachung');
    expect(mocks.push).toHaveBeenCalledWith('/einsatz/f1/atemschutzueberwachung');
  });

  it('meldet den Listener beim Abbau ab', async () => {
    const { unmount } = render(<NativeNotificationTaps />);
    await waitFor(() => expect(mocks.onUrl).toBeDefined());
    unmount();
    await waitFor(() => expect(mocks.remove).toHaveBeenCalled());
  });
});
