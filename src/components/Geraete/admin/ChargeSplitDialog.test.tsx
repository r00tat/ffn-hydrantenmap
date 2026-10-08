// @vitest-environment jsdom
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Geraet, GeraetBestand } from '../../../common/geraet';
import { renderWithIntl } from '../../../test-utils/intlRender';

const { aufteilenGeraetBestand } = vi.hoisted(() => ({ aufteilenGeraetBestand: vi.fn() }));

vi.mock('../geraeteActions', () => ({ aufteilenGeraetBestand }));

import ChargeSplitDialog from './ChargeSplitDialog';

const geraet: Geraet = {
  id: 'g1',
  bezeichnung: 'Ölbindemittel',
  verbrauchsmaterial: true,
  einheit: 'Sack',
  bestandGesamt: 10,
  active: true,
  chargen: [
    { id: 'c1', losNummer: 'A1', ablaufDatum: '2027-01-31', createdAt: '', createdBy: '' },
    { id: 'c2', bezeichnung: 'Lieferung Mai', createdAt: '', createdBy: '' },
    { id: 'c3', bezeichnung: 'Alt', archiviert: true, createdAt: '', createdBy: '' },
  ],
  createdAt: '',
  createdBy: '',
  updatedAt: '',
  updatedBy: '',
};

const lager: GeraetBestand = {
  id: 'b1',
  geraetId: 'g1',
  lagerortKey: 'raum|fwh|lager',
  lagerort: { art: 'raum', standort: 'Feuerwehrhaus', raum: 'Lager' },
  anzahl: 10,
  chargen: { c1: 4 },
};

describe('ChargeSplitDialog', () => {
  const onClose = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    aufteilenGeraetBestand.mockResolvedValue({ id: 'b1' });
  });

  function render(bestand: GeraetBestand = lager) {
    return renderWithIntl(
      <ChargeSplitDialog open groupId="ffnd" geraet={geraet} bestand={bestand} onClose={onClose} />,
    );
  }

  it('zeigt ein Feld je aktiver Charge, vorbelegt, und den Rest ohne Charge', () => {
    render();
    expect(screen.getByLabelText('Los A1')).toHaveValue(4);
    expect(screen.getByLabelText('Lieferung Mai')).toHaveValue(null);
    expect(screen.queryByLabelText('Alt')).toBeNull();
    expect(screen.getByText('ohne Charge: 6')).toBeInTheDocument();
  });

  it('speichert die neue Aufteilung', async () => {
    const user = userEvent.setup();
    render();
    await user.type(screen.getByLabelText('Lieferung Mai'), '5');
    expect(screen.getByText('ohne Charge: 1')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Speichern' }));
    await waitFor(() =>
      expect(aufteilenGeraetBestand).toHaveBeenCalledWith('ffnd', 'b1', { c1: 4, c2: 5 }),
    );
    expect(onClose).toHaveBeenCalled();
  });

  it('sperrt Speichern, wenn mehr zugeordnet ist als vorhanden', async () => {
    const user = userEvent.setup();
    render();
    await user.type(screen.getByLabelText('Lieferung Mai'), '7');
    expect(screen.getByText('Den Chargen ist mehr zugeordnet als vorhanden (10).')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Speichern' })).toBeDisabled();
  });

  it('sperrt Speichern bei einer ungültigen Menge', async () => {
    const user = userEvent.setup();
    render();
    const field = screen.getByLabelText('Los A1');
    await user.clear(field);
    await user.type(field, '-1');
    expect(screen.getByRole('button', { name: 'Speichern' })).toBeDisabled();
  });

  it('zeigt einen Fehler der Action', async () => {
    aufteilenGeraetBestand.mockRejectedValue(new Error('kaputt'));
    const user = userEvent.setup();
    render();
    await user.click(screen.getByRole('button', { name: 'Speichern' }));
    expect(await screen.findByText('Speichern fehlgeschlagen: kaputt')).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });
});
