// @vitest-environment jsdom
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { defaultPosition } from '../../../hooks/constants';
import { renderWithIntl } from '../../../test-utils/intlRender';

// `stammdatenActions` ist eine 'use server'/'server-only'-Datei und lässt sich
// im Test nicht laden.
const { saveFahrtenbuchGroupStandort } = vi.hoisted(() => ({
  saveFahrtenbuchGroupStandort: vi.fn(),
}));

vi.mock('../stammdatenActions', () => ({
  saveFahrtenbuchGroupStandort,
}));

const { useFahrtenbuchGroupStandort } = vi.hoisted(() => ({
  useFahrtenbuchGroupStandort: vi.fn(),
}));

vi.mock('../../../hooks/useFahrtenbuchGroupStandort', () => ({
  default: useFahrtenbuchGroupStandort,
}));

import GroupSettings from './GroupSettings';

describe('GroupSettings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    saveFahrtenbuchGroupStandort.mockResolvedValue({ success: true });
    useFahrtenbuchGroupStandort.mockReturnValue({
      standort: { lat: 47.94, lng: 16.84 },
      configured: true,
    });
  });

  it('zeigt den gepflegten Standort an', () => {
    renderWithIntl(<GroupSettings groupId="ffnd" />);
    expect(screen.getByLabelText('Breitengrad')).toHaveValue(47.94);
    expect(screen.getByLabelText('Längengrad')).toHaveValue(16.84);
  });

  it('speichert geänderte Koordinaten', async () => {
    const user = userEvent.setup();
    renderWithIntl(<GroupSettings groupId="ffnd" />);

    const lat = screen.getByLabelText('Breitengrad');
    await user.clear(lat);
    await user.type(lat, '48');
    await user.click(screen.getByRole('button', { name: 'Speichern' }));

    await waitFor(() =>
      expect(saveFahrtenbuchGroupStandort).toHaveBeenCalledWith('ffnd', {
        lat: 48,
        lng: 16.84,
      }),
    );
    expect(
      await screen.findByText('Standort gespeichert.'),
    ).toBeInTheDocument();
  });

  it('meldet ungültige Koordinaten', async () => {
    saveFahrtenbuchGroupStandort.mockResolvedValue({
      success: false,
      error: 'standortInvalid',
    });
    const user = userEvent.setup();
    renderWithIntl(<GroupSettings groupId="ffnd" />);

    await user.click(screen.getByRole('button', { name: 'Speichern' }));

    expect(
      await screen.findByText('Die Koordinaten sind ungültig.'),
    ).toBeInTheDocument();
  });

  it('meldet einen sonstigen Fehler beim Speichern', async () => {
    saveFahrtenbuchGroupStandort.mockResolvedValue({
      success: false,
      error: 'offline',
    });
    const user = userEvent.setup();
    renderWithIntl(<GroupSettings groupId="ffnd" />);

    await user.click(screen.getByRole('button', { name: 'Speichern' }));

    expect(
      await screen.findByText('Speichern fehlgeschlagen: offline'),
    ).toBeInTheDocument();
  });

  it('übernimmt einen Standort, der erst nach dem ersten Rendern eintrifft', () => {
    // Regressionstest für den Entwurfsfehler aus der Task-Beschreibung: Ein
    // `useState(String(standort.lat))`-Anfangswert griffe nur beim ersten
    // Rendern. Der Firestore-Snapshot des Hooks kommt aber asynchron — das
    // Formular müsste trotzdem den zuletzt geladenen Wert zeigen.
    useFahrtenbuchGroupStandort.mockReturnValue({
      standort: defaultPosition,
      configured: false,
    });
    const { rerender } = renderWithIntl(<GroupSettings groupId="ffnd" />);

    expect(screen.getByLabelText('Breitengrad')).toHaveValue(
      defaultPosition.lat,
    );

    useFahrtenbuchGroupStandort.mockReturnValue({
      standort: { lat: 47.94, lng: 16.84 },
      configured: true,
    });
    rerender(<GroupSettings groupId="ffnd" />);

    expect(screen.getByLabelText('Breitengrad')).toHaveValue(47.94);
  });
});
