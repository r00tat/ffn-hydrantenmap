// @vitest-environment jsdom
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Geraet, GeraetBestand } from '../../../common/geraet';
import { renderWithIntl } from '../../../test-utils/intlRender';

const { deleteGeraetBestand, saveGeraet, lagerortDialogProps } = vi.hoisted(() => ({
  deleteGeraetBestand: vi.fn(),
  saveGeraet: vi.fn(),
  lagerortDialogProps: vi.fn(),
}));

vi.mock('../geraeteActions', () => ({ deleteGeraetBestand, saveGeraet }));
vi.mock('./BestandBookingDialog', () => ({ default: () => null }));
vi.mock('./LagerortDialog', () => ({
  default: (props: { bestand?: GeraetBestand }) => {
    lagerortDialogProps(props);
    return <div>Lagerort-Dialog {props.bestand ? props.bestand.id : 'neu'}</div>;
  },
}));

import GeraetDetailDialog from './GeraetDetailDialog';

const geraet: Geraet = {
  id: 'g1',
  bezeichnung: 'Bindevlies Economy',
  verbrauchsmaterial: true,
  einheit: 'Sack',
  bestandGesamt: 5,
  active: true,
  createdAt: '',
  createdBy: '',
  updatedAt: '',
  updatedBy: '',
};

const srf: GeraetBestand = {
  id: 'b1',
  geraetId: 'g1',
  lagerortKey: 'fahrzeug|srf|gr 2',
  lagerort: { art: 'fahrzeug', fahrzeug: 'SRF', laderaum: 'GR 2' },
  anzahl: 2,
};

function render(canManage = true, item: Geraet = geraet) {
  return renderWithIntl(
    <GeraetDetailDialog
      open
      groupId="ffnd"
      geraet={item}
      bestaende={[srf]}
      allBestaende={[srf]}
      containers={[]}
      canManage={canManage}
      onClose={vi.fn()}
      onEdit={vi.fn()}
    />,
  );
}

describe('GeraetDetailDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    deleteGeraetBestand.mockResolvedValue({ id: 'b1', deleted: true });
    saveGeraet.mockResolvedValue({ id: 'g1' });
  });

  it('öffnet den Lagerort-Dialog zum Bearbeiten', async () => {
    const user = userEvent.setup();
    render();
    await user.click(screen.getByRole('button', { name: 'Lagerort bearbeiten' }));
    expect(screen.getByText('Lagerort-Dialog b1')).toBeInTheDocument();
  });

  it('löscht einen Lagerort nach Rückfrage mit Hinweis auf den Restbestand', async () => {
    const user = userEvent.setup();
    render();
    await user.click(screen.getByRole('button', { name: 'Lagerort löschen' }));
    expect(screen.getByText(/Restbestand von 2 Sack/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Löschen' }));
    await waitFor(() => expect(deleteGeraetBestand).toHaveBeenCalledWith('ffnd', 'b1'));
  });

  it('zeigt einen Fehler beim Löschen an', async () => {
    deleteGeraetBestand.mockRejectedValue(new Error('kaputt'));
    const user = userEvent.setup();
    render();
    await user.click(screen.getByRole('button', { name: 'Lagerort löschen' }));
    await user.click(screen.getByRole('button', { name: 'Löschen' }));
    expect(await screen.findByText('Löschen fehlgeschlagen: kaputt')).toBeInTheDocument();
  });

  it('ohne Pflegerecht weder Bearbeiten noch Löschen', () => {
    render(false);
    expect(screen.queryByRole('button', { name: 'Lagerort bearbeiten' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Lagerort löschen' })).toBeNull();
  });

  describe('Verbrauchsmaterial am Artikel', () => {
    it('schaltet ein Gerät zum Verbrauchsmaterial um', async () => {
      const user = userEvent.setup();
      render(true, { ...geraet, verbrauchsmaterial: false });
      const toggle = screen.getByRole('switch', { name: 'Verbrauchsmaterial' });
      expect(toggle).not.toBeChecked();
      await user.click(toggle);
      await waitFor(() =>
        expect(saveGeraet).toHaveBeenCalledWith('ffnd', { id: 'g1', verbrauchsmaterial: true }),
      );
    });

    it('nimmt beim Abschalten auch den Mindestbestand weg', async () => {
      const user = userEvent.setup();
      render(true, { ...geraet, mindestbestand: 3 });
      const toggle = screen.getByRole('switch', { name: 'Verbrauchsmaterial' });
      expect(toggle).toBeChecked();
      await user.click(toggle);
      await waitFor(() =>
        expect(saveGeraet).toHaveBeenCalledWith('ffnd', {
          id: 'g1',
          verbrauchsmaterial: false,
          mindestbestand: null,
        }),
      );
    });

    it('zeigt einen Fehler beim Umschalten an', async () => {
      saveGeraet.mockRejectedValue(new Error('offline'));
      const user = userEvent.setup();
      render();
      await user.click(screen.getByRole('switch', { name: 'Verbrauchsmaterial' }));
      expect(await screen.findByText('Speichern fehlgeschlagen: offline')).toBeInTheDocument();
    });

    it('ohne Pflegerecht nur die Kennzeichnung, kein Schalter', () => {
      render(false);
      expect(screen.queryByRole('switch')).toBeNull();
      expect(screen.getByText('Verbrauchsmaterial')).toBeInTheDocument();
    });
  });
});
