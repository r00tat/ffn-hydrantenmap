// @vitest-environment jsdom
import { renderHook } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { ReactNode } from 'react';
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import deMessages from '../../messages/de.json';

const { showSnackbarMock, waitForPendingWritesMock, getPendingWriteCountMock } =
  vi.hoisted(() => ({
    showSnackbarMock: vi.fn(),
    waitForPendingWritesMock: vi.fn(() => Promise.resolve()),
    getPendingWriteCountMock: vi.fn(() => 0),
  }));

vi.mock('../components/firebase/firebase', () => ({
  default: {},
  firestore: { type: 'mock-firestore' },
}));

vi.mock('firebase/firestore', () => ({
  waitForPendingWrites: waitForPendingWritesMock,
}));

vi.mock('../components/providers/SnackbarProvider', () => ({
  useSnackbar: () => showSnackbarMock,
}));

vi.mock('../lib/pendingWrites', () => ({
  getPendingWriteCount: getPendingWriteCountMock,
}));

function setNavigatorOnLine(value: boolean) {
  Object.defineProperty(window.navigator, 'onLine', {
    configurable: true,
    value,
  });
}

import useOfflineSync from './useOfflineSync';

function wrapper({ children }: { children: ReactNode }) {
  return (
    <NextIntlClientProvider locale="de" messages={deMessages}>
      {children}
    </NextIntlClientProvider>
  );
}

describe('useOfflineSync', () => {
  beforeEach(() => {
    setNavigatorOnLine(true);
    showSnackbarMock.mockClear();
    waitForPendingWritesMock.mockClear();
    waitForPendingWritesMock.mockResolvedValue(undefined);
    getPendingWriteCountMock.mockReturnValue(0);
  });

  afterEach(() => {
    setNavigatorOnLine(true);
  });

  it('does nothing while staying online', () => {
    renderHook(() => useOfflineSync(), { wrapper });
    expect(waitForPendingWritesMock).not.toHaveBeenCalled();
    expect(showSnackbarMock).not.toHaveBeenCalled();
  });

  it('shows a confirmation after reconnecting when writes were pending', async () => {
    setNavigatorOnLine(false);
    getPendingWriteCountMock.mockReturnValue(2);
    const { rerender } = renderHook(() => useOfflineSync(), { wrapper });

    setNavigatorOnLine(true);
    rerender();

    expect(waitForPendingWritesMock).toHaveBeenCalledTimes(1);
    await vi.waitFor(() => {
      expect(showSnackbarMock).toHaveBeenCalledWith(
        deMessages.networkStatus.synced,
        'success',
      );
    });
  });

  it('does not show a confirmation when no writes were pending', () => {
    setNavigatorOnLine(false);
    getPendingWriteCountMock.mockReturnValue(0);
    const { rerender } = renderHook(() => useOfflineSync(), { wrapper });

    setNavigatorOnLine(true);
    rerender();

    expect(waitForPendingWritesMock).not.toHaveBeenCalled();
    expect(showSnackbarMock).not.toHaveBeenCalled();
  });
});
