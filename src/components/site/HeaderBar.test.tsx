// @vitest-environment jsdom
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithIntl as render } from '../../test-utils/intlRender';
import HeaderBar from './HeaderBar';

vi.mock('../firebase/firestore', () => ({}));
vi.mock('../FirecallItems/EinsatzDialog', () => ({ default: () => null }));
vi.mock('./HistoryDialog', () => ({ default: () => null }));

vi.mock('../../hooks/useFirebaseLogin', () => ({
  default: () => ({
    isSignedIn: true,
    isAuthorized: true,
    displayName: 'Max Mustermann',
    photoURL: '',
  }),
}));

let firecall: { id?: string; name?: string } | undefined;
vi.mock('../../hooks/useFirecall', () => ({
  default: () => firecall,
}));

vi.mock('../../hooks/useFirecallWriteAccess', () => ({
  useIsReadOnlyFirecallGuest: () => false,
}));

vi.mock('../../hooks/useMapEditor', () => ({
  default: () => ({
    history: [],
    selectHistory: vi.fn(),
    selectedHistory: undefined,
    historyModeActive: false,
  }),
}));

let connectivityStatus: 'online' | 'offline' | 'syncing' = 'online';
vi.mock('../../hooks/useConnectivity', () => ({
  default: () => ({
    reachable: connectivityStatus !== 'offline',
    status: connectivityStatus,
    lastCheck: null,
    pendingWrites: 0,
  }),
}));

function renderHeader() {
  return render(<HeaderBar isDrawerOpen={false} setIsDrawerOpen={vi.fn()} />);
}

describe('HeaderBar', () => {
  beforeEach(() => {
    firecall = undefined;
    connectivityStatus = 'online';
  });

  it('zeigt den Offline-Modus als Chip in der Kopfzeile', () => {
    connectivityStatus = 'offline';
    renderHeader();
    expect(screen.getByText('Offline-Modus')).toBeInTheDocument();
  });

  it('zeigt online keinen Verbindungs-Chip', () => {
    renderHeader();
    expect(screen.queryByText('Offline-Modus')).not.toBeInTheDocument();
  });

  it('führt über Logo und App-Titel zur Karte des Einsatzes', () => {
    firecall = { id: 'abc', name: 'Brand Musterstraße' };
    renderHeader();

    const mapLink = screen.getByRole('link', { name: 'Zur Karte' });
    expect(mapLink).toHaveAttribute('href', '/einsatz/abc');
    expect(mapLink).toHaveTextContent('Einsatzkarte');
    expect(mapLink.querySelector('img')).not.toBeNull();
  });

  it('führt ohne Einsatz zur Startkarte', () => {
    renderHeader();

    expect(screen.getByRole('link', { name: 'Zur Karte' })).toHaveAttribute('href', '/');
  });

  it('führt über den Einsatznamen zur Detailseite', () => {
    firecall = { id: 'abc', name: 'Brand Musterstraße' };
    renderHeader();

    expect(screen.getByRole('link', { name: 'Brand Musterstraße' })).toHaveAttribute(
      'href',
      '/einsatz/abc/details',
    );
  });

  it('erklärt beide Links mit einem Tooltip', async () => {
    firecall = { id: 'abc', name: 'Brand Musterstraße' };
    renderHeader();
    const user = userEvent.setup();

    await user.hover(screen.getByRole('link', { name: 'Zur Karte' }));
    expect(await screen.findByRole('tooltip')).toHaveTextContent('Zur Karte');

    await user.unhover(screen.getByRole('link', { name: 'Zur Karte' }));
    await user.hover(screen.getByRole('link', { name: 'Brand Musterstraße' }));
    expect(await screen.findByRole('tooltip', { name: 'Einsatzdetails' })).toBeInTheDocument();
  });
});
