// @vitest-environment jsdom
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Geraet, GeraetBestand } from '../../../common/geraet';
import { renderWithIntl } from '../../../test-utils/intlRender';

const { deleteGeraetBestand, lagerortDialogProps } = vi.hoisted(() => ({
  deleteGeraetBestand: vi.fn(),
  lagerortDialogProps: vi.fn(),
}));

vi.mock('../geraeteActions', () => ({ deleteGeraetBestand }));
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

function render(canManage = true) {
  return renderWithIntl(
    <GeraetDetailDialog
      open
      groupId="ffnd"
      geraet={geraet}
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
});
