// @vitest-environment jsdom
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { defaultPosition } from '../../../hooks/constants';
import { renderWithIntl } from '../../../test-utils/intlRender';

// `stammdatenActions` ist eine 'use server'/'server-only'-Datei und lässt sich
// im Test nicht laden.
const { saveFahrtenbuchGroupStandort, saveFahrtenbuchGroupFeuerwehrName } =
  vi.hoisted(() => ({
    saveFahrtenbuchGroupStandort: vi.fn(),
    saveFahrtenbuchGroupFeuerwehrName: vi.fn(),
  }));

vi.mock('../stammdatenActions', () => ({
  saveFahrtenbuchGroupStandort,
  saveFahrtenbuchGroupFeuerwehrName,
}));

const { useFahrtenbuchGroupStandort } = vi.hoisted(() => ({
  useFahrtenbuchGroupStandort: vi.fn(),
}));

vi.mock('../../../hooks/useFahrtenbuchGroupStandort', () => ({
  default: useFahrtenbuchGroupStandort,
}));

// Abonniert das Gruppendokument und initialisiert damit Firebase, das im Test
// keine Konfiguration hat.
const { useGroupFeuerwehrName } = vi.hoisted(() => ({
  useGroupFeuerwehrName: vi.fn(),
}));

vi.mock('../../../hooks/useGroupFeuerwehrName', () => ({
  default: useGroupFeuerwehrName,
}));

// Leaflet braucht ein echtes Layout und lädt Kartenkacheln; hier zählt nur, mit
// welcher Ausgangsposition der Picker geöffnet wird und was mit dem Ergebnis
// passiert.
vi.mock('../../Einsatzorte/LocationMapPicker', () => ({
  default: ({
    open,
    onConfirm,
    initialLat,
    initialLng,
  }: {
    open: boolean;
    onConfirm: (lat: number, lng: number) => void;
    initialLat?: number;
    initialLng?: number;
  }) =>
    open ? (
      <div>
        <span>{`picker:${initialLat ?? '-'}/${initialLng ?? '-'}`}</span>
        <button onClick={() => onConfirm(48.1234567, 16.7654321)}>
          picker-confirm
        </button>
      </div>
    ) : null,
}));

import GroupSettings from './GroupSettings';

describe('GroupSettings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    saveFahrtenbuchGroupStandort.mockResolvedValue({ success: true });
    saveFahrtenbuchGroupFeuerwehrName.mockResolvedValue({ success: true });
    useGroupFeuerwehrName.mockReturnValue(undefined);
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

    expect(screen.getByLabelText('Breitengrad')).toHaveValue(null);

    useFahrtenbuchGroupStandort.mockReturnValue({
      standort: { lat: 47.94, lng: 16.84 },
      configured: true,
    });
    rerender(<GroupSettings groupId="ffnd" />);

    expect(screen.getByLabelText('Breitengrad')).toHaveValue(47.94);
  });

  it('lässt die Felder leer, wenn kein Standort gepflegt ist', () => {
    // Sonst sähe die Verwalterin einer anderen Feuerwehr den Neusiedler
    // Standardstandort wie einen eigenen, gepflegten Wert.
    useFahrtenbuchGroupStandort.mockReturnValue({
      standort: defaultPosition,
      configured: false,
    });
    renderWithIntl(<GroupSettings groupId="ffnd" />);

    expect(screen.getByLabelText('Breitengrad')).toHaveValue(null);
    expect(screen.getByLabelText('Längengrad')).toHaveValue(null);
    // Der Standardwert bleibt als Platzhalter erkennbar.
    expect(screen.getByLabelText('Breitengrad')).toHaveAttribute(
      'placeholder',
      String(defaultPosition.lat),
    );
  });

  it('übernimmt eine auf der Karte gewählte Position', async () => {
    const user = userEvent.setup();
    renderWithIntl(<GroupSettings groupId="ffnd" />);

    await user.click(screen.getByRole('button', { name: 'Auf Karte wählen' }));
    await user.click(screen.getByRole('button', { name: 'picker-confirm' }));

    // Sechs Dezimalstellen wie bei den Risikoobjekten — mehr als
    // zentimetergenau, und ohne die Rundung stünde eine 15-stellige Zahl im
    // Feld.
    expect(screen.getByLabelText('Breitengrad')).toHaveValue(48.123457);
    expect(screen.getByLabelText('Längengrad')).toHaveValue(16.765432);

    await user.click(screen.getByRole('button', { name: 'Speichern' }));
    await waitFor(() =>
      expect(saveFahrtenbuchGroupStandort).toHaveBeenCalledWith('ffnd', {
        lat: 48.123457,
        lng: 16.765432,
      }),
    );
  });

  it('öffnet die Karte am gepflegten Standort', async () => {
    const user = userEvent.setup();
    renderWithIntl(<GroupSettings groupId="ffnd" />);

    await user.click(screen.getByRole('button', { name: 'Auf Karte wählen' }));

    expect(screen.getByText('picker:47.94/16.84')).toBeInTheDocument();
  });

  it('öffnet die Karte ohne Ausgangsposition, wenn kein Standort gepflegt ist', async () => {
    // Sonst wäre der Neusiedler Standardstandort schon als Markierung gesetzt
    // und ein Klick auf „Übernehmen" schriebe ihn als eigenen Wert fest.
    useFahrtenbuchGroupStandort.mockReturnValue({
      standort: defaultPosition,
      configured: false,
    });
    const user = userEvent.setup();
    renderWithIntl(<GroupSettings groupId="ffnd" />);

    await user.click(screen.getByRole('button', { name: 'Auf Karte wählen' }));

    expect(screen.getByText('picker:-/-')).toBeInTheDocument();
  });

  it('setzt den Standort zurück, wenn beide Felder geleert werden', async () => {
    const user = userEvent.setup();
    renderWithIntl(<GroupSettings groupId="ffnd" />);

    await user.clear(screen.getByLabelText('Breitengrad'));
    await user.clear(screen.getByLabelText('Längengrad'));
    await user.click(screen.getByRole('button', { name: 'Speichern' }));

    // Nicht (0,0): `Number('')` wäre 0 und würde als ungültig abgelehnt — es
    // gäbe keinen Weg zurück zum Standardstandort.
    await waitFor(() =>
      expect(saveFahrtenbuchGroupStandort).toHaveBeenCalledWith(
        'ffnd',
        undefined,
      ),
    );
  });
});
