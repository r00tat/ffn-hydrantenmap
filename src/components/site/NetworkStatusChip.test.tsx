// @vitest-environment jsdom
import { act, fireEvent, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ConnectivityState } from '../../lib/connectivity';
import { renderWithIntl } from '../../test-utils/intlRender';
import NetworkStatusChip, { SYNCING_DISPLAY_DELAY_MS } from './NetworkStatusChip';

const { state, checkMock } = vi.hoisted(() => ({
  state: {
    current: {
      reachable: true,
      status: 'online',
      lastCheck: null,
      pendingWrites: 0,
    } as ConnectivityState,
  },
  checkMock: vi.fn(() => Promise.resolve(true)),
}));

vi.mock('../../hooks/useConnectivity', () => ({
  default: () => state.current,
}));

vi.mock('../../lib/connectivity', () => ({
  checkConnectivityNow: checkMock,
}));

function setState(next: Partial<ConnectivityState>) {
  state.current = { ...state.current, ...next };
}

describe('NetworkStatusChip', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    checkMock.mockClear();
    state.current = {
      reachable: true,
      status: 'online',
      lastCheck: null,
      pendingWrites: 0,
    };
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('zeigt online nichts an', () => {
    const { container } = renderWithIntl(<NetworkStatusChip />);
    expect(container).toBeEmptyDOMElement();
  });

  it('zeigt offline dauerhaft den Offline-Modus', () => {
    setState({ reachable: false, status: 'offline' });
    renderWithIntl(<NetworkStatusChip />);
    expect(screen.getByText('Offline-Modus')).toBeInTheDocument();
  });

  it('nennt offline die Zahl ausstehender Änderungen', () => {
    setState({ reachable: false, status: 'offline', pendingWrites: 3 });
    renderWithIntl(<NetworkStatusChip />);
    expect(
      screen.getByText('Offline-Modus · 3 Änderungen ausstehend'),
    ).toBeInTheDocument();
  });

  it('prüft beim Antippen die Verbindung erneut', () => {
    setState({ reachable: false, status: 'offline' });
    renderWithIntl(<NetworkStatusChip />);
    fireEvent.click(screen.getByRole('button'));
    expect(checkMock).toHaveBeenCalledTimes(1);
  });

  it('zeigt die Übertragung erst, wenn sie länger dauert', () => {
    // Jeder gewöhnliche Schreibvorgang ist online für einen Augenblick offen;
    // der Chip soll dabei nicht aufblitzen.
    setState({ status: 'syncing', pendingWrites: 2 });
    renderWithIntl(<NetworkStatusChip />);
    expect(
      screen.queryByText('2 Änderungen werden übertragen…'),
    ).not.toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(SYNCING_DISPLAY_DELAY_MS);
    });
    expect(
      screen.getByText('2 Änderungen werden übertragen…'),
    ).toBeInTheDocument();
  });

  it('verwendet die Einzahl bei einer Änderung', () => {
    setState({ status: 'syncing', pendingWrites: 1 });
    renderWithIntl(<NetworkStatusChip />);
    act(() => {
      vi.advanceTimersByTime(SYNCING_DISPLAY_DELAY_MS);
    });
    expect(screen.getByText('1 Änderung wird übertragen…')).toBeInTheDocument();
  });

  it('verschwindet, sobald alles übertragen ist', () => {
    setState({ status: 'syncing', pendingWrites: 1 });
    const { container, rerender } = renderWithIntl(<NetworkStatusChip />);
    act(() => {
      vi.advanceTimersByTime(SYNCING_DISPLAY_DELAY_MS);
    });
    expect(container).not.toBeEmptyDOMElement();

    setState({ status: 'online', pendingWrites: 0 });
    rerender(<NetworkStatusChip />);
    expect(container).toBeEmptyDOMElement();
  });
});
