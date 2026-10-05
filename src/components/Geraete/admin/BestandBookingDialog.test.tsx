// @vitest-environment jsdom
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Geraet, GeraetBestand } from '../../../common/geraet';
import { renderWithIntl } from '../../../test-utils/intlRender';

const { bookGeraetBestand } = vi.hoisted(() => ({ bookGeraetBestand: vi.fn() }));

vi.mock('../geraeteActions', () => ({ bookGeraetBestand }));

import BestandBookingDialog, { type BestandBookingMode } from './BestandBookingDialog';

const geraet: Geraet = {
  id: 'g1',
  bezeichnung: 'Bindevlies Economy',
  verbrauchsmaterial: true,
  einheit: 'Sack',
  bestandGesamt: 9,
  active: true,
  createdAt: '',
  createdBy: '',
  updatedAt: '',
  updatedBy: '',
};

const lager: GeraetBestand = {
  id: 'b-lager',
  geraetId: 'g1',
  lagerortKey: 'raum|feuerwehrhaus|lager',
  lagerort: { art: 'raum', standort: 'Feuerwehrhaus', raum: 'Lager' },
  anzahl: 6,
};
const srf: GeraetBestand = {
  id: 'b-srf',
  geraetId: 'g1',
  lagerortKey: 'fahrzeug|srf|gr 2',
  lagerort: { art: 'fahrzeug', fahrzeug: 'SRF', laderaum: 'GR 2' },
  anzahl: 3,
};

describe('BestandBookingDialog', () => {
  const onClose = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    bookGeraetBestand.mockResolvedValue(undefined);
  });

  function render(mode: BestandBookingMode, bestaende = [lager, srf]) {
    return renderWithIntl(
      <BestandBookingDialog
        open
        groupId="ffnd"
        geraet={geraet}
        bestand={lager}
        bestaende={bestaende}
        mode={mode}
        onClose={onClose}
      />,
    );
  }

  it('bucht einen Zugang', async () => {
    const user = userEvent.setup();
    render('zugang');
    await user.type(screen.getByLabelText('Menge'), '5');
    await user.type(screen.getByLabelText('Bemerkung'), 'Lieferung');
    await user.click(screen.getByRole('button', { name: 'Buchen' }));
    await waitFor(() =>
      expect(bookGeraetBestand).toHaveBeenCalledWith('ffnd', {
        art: 'zugang',
        bestandId: 'b-lager',
        menge: 5,
        bemerkung: 'Lieferung',
      }),
    );
    expect(onClose).toHaveBeenCalled();
  });

  it('lehnt eine Menge von 0 ab', async () => {
    const user = userEvent.setup();
    render('zugang');
    await user.type(screen.getByLabelText('Menge'), '0');
    await user.click(screen.getByRole('button', { name: 'Buchen' }));
    expect(await screen.findByText('Bitte eine Menge größer 0 angeben.')).toBeInTheDocument();
    expect(bookGeraetBestand).not.toHaveBeenCalled();
  });

  it('bucht eine Umbuchung auf den anderen Lagerort', async () => {
    const user = userEvent.setup();
    render('umbuchung');
    await user.type(screen.getByLabelText('Menge'), '2');
    await user.click(screen.getByRole('button', { name: 'Buchen' }));
    await waitFor(() =>
      expect(bookGeraetBestand).toHaveBeenCalledWith('ffnd', {
        art: 'umbuchung',
        bestandId: 'b-lager',
        zielBestandId: 'b-srf',
        menge: 2,
        bemerkung: undefined,
      }),
    );
  });

  it('verweist ohne zweiten Lagerort auf das Anlegen eines Lagerorts', () => {
    render('umbuchung', [lager]);
    expect(
      screen.getByText('Der Artikel hat keinen weiteren Lagerort. Lege zuerst einen an.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Buchen' })).toBeDisabled();
  });

  it('setzt bei der Inventur den gezählten Bestand, vorbelegt mit dem aktuellen', async () => {
    const user = userEvent.setup();
    render('inventur');
    const ist = screen.getByLabelText('Gezählter Bestand');
    expect(ist).toHaveValue(6);
    await user.clear(ist);
    await user.type(ist, '4');
    await user.click(screen.getByRole('button', { name: 'Buchen' }));
    await waitFor(() =>
      expect(bookGeraetBestand).toHaveBeenCalledWith('ffnd', {
        art: 'inventur',
        bestandId: 'b-lager',
        istWert: 4,
        bemerkung: undefined,
      }),
    );
  });

  it('setzt bei der Inventur auch einen Bestand mit Kommastelle', async () => {
    const user = userEvent.setup();
    renderWithIntl(
      <BestandBookingDialog
        open
        groupId="ffnd"
        geraet={geraet}
        bestand={{ ...lager, anzahl: 7.5 }}
        bestaende={[lager, srf]}
        mode="inventur"
        onClose={onClose}
      />,
    );
    // Vorbelegt mit 7,5 aus einem Verbrauch — lässt sich unverändert speichern.
    await user.click(screen.getByRole('button', { name: 'Buchen' }));
    await waitFor(() =>
      expect(bookGeraetBestand).toHaveBeenCalledWith('ffnd', {
        art: 'inventur',
        bestandId: 'b-lager',
        istWert: 7.5,
        bemerkung: undefined,
      }),
    );
  });

  it('bucht einen Zugang mit Kommastelle', async () => {
    const user = userEvent.setup();
    render('zugang');
    await user.type(screen.getByLabelText('Menge'), '2.5');
    await user.click(screen.getByRole('button', { name: 'Buchen' }));
    await waitFor(() =>
      expect(bookGeraetBestand).toHaveBeenCalledWith('ffnd', {
        art: 'zugang',
        bestandId: 'b-lager',
        menge: 2.5,
        bemerkung: undefined,
      }),
    );
  });

  it('zeigt einen Fehler der Action', async () => {
    bookGeraetBestand.mockRejectedValue(new Error('forbidden'));
    const user = userEvent.setup();
    render('zugang');
    await user.type(screen.getByLabelText('Menge'), '1');
    await user.click(screen.getByRole('button', { name: 'Buchen' }));
    expect(await screen.findByText('Speichern fehlgeschlagen: forbidden')).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });
});
