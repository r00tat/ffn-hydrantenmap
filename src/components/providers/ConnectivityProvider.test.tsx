// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

const { startMock, stopMock, offlineSyncMock, offlineQueueMock } = vi.hoisted(
  () => {
    const stopMock = vi.fn();
    return {
      stopMock,
      startMock: vi.fn(() => stopMock),
      offlineSyncMock: vi.fn(),
      offlineQueueMock: vi.fn(),
    };
  },
);

vi.mock('../../lib/connectivity', () => ({
  startConnectivityMonitor: startMock,
}));

vi.mock('../../hooks/useOfflineSync', () => ({
  default: offlineSyncMock,
}));

vi.mock('../../hooks/useOfflineQueue', () => ({
  default: offlineQueueMock,
}));

import ConnectivityProvider from './ConnectivityProvider';

describe('ConnectivityProvider', () => {
  it('startet die Überwachung beim Einhängen und stoppt sie beim Aushängen', () => {
    const { unmount } = render(
      <ConnectivityProvider>
        <span>Inhalt</span>
      </ConnectivityProvider>,
    );
    expect(screen.getByText('Inhalt')).toBeInTheDocument();
    expect(startMock).toHaveBeenCalledTimes(1);
    expect(stopMock).not.toHaveBeenCalled();

    unmount();
    expect(stopMock).toHaveBeenCalledTimes(1);
  });

  it('meldet die Synchronisation nach dem Reconnect', () => {
    render(<ConnectivityProvider>{null}</ConnectivityProvider>);
    expect(offlineSyncMock).toHaveBeenCalled();
  });

  it('startet die Warteschlange für Server Actions und Uploads', () => {
    render(<ConnectivityProvider>{null}</ConnectivityProvider>);
    expect(offlineQueueMock).toHaveBeenCalled();
  });
});
