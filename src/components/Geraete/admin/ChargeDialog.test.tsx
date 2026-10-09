// @vitest-environment jsdom
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  GERAET_CHARGE_MAX_TEXT,
  type GeraetBestand,
  type GeraetCharge,
} from '../../../common/geraet';
import { renderWithIntl } from '../../../test-utils/intlRender';

const { saveGeraetCharge, korrigiereGeraetChargenBestand } = vi.hoisted(() => ({
  saveGeraetCharge: vi.fn(),
  korrigiereGeraetChargenBestand: vi.fn(),
}));

vi.mock('../geraeteActions', () => ({ saveGeraetCharge, korrigiereGeraetChargenBestand }));

import ChargeDialog from './ChargeDialog';

const charge: GeraetCharge = {
  id: 'c1',
  bezeichnung: 'Lieferung März',
  produktionsNummer: 'L-42',
  ablaufDatum: '2027-03-31',
  createdAt: '',
  createdBy: '',
};

describe('ChargeDialog', () => {
  const onClose = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    saveGeraetCharge.mockResolvedValue({ id: 'neu' });
    korrigiereGeraetChargenBestand.mockResolvedValue({ bookings: 1 });
  });

  it('legt eine Charge an — alle Felder optional', async () => {
    const user = userEvent.setup();
    renderWithIntl(<ChargeDialog open groupId="ffnd" geraetId="g1" onClose={onClose} />);
    expect(screen.getByText('Neue Charge')).toBeInTheDocument();
    await user.type(screen.getByLabelText('LOT / Chargennummer'), 'L-7');
    await user.type(screen.getByLabelText('Ablaufdatum'), '2027-05-01');
    await user.click(screen.getByRole('button', { name: 'Speichern' }));
    await waitFor(() =>
      expect(saveGeraetCharge).toHaveBeenCalledWith('ffnd', 'g1', {
        bezeichnung: '',
        produktionsNummer: 'L-7',
        einkaufsDatum: '',
        ablaufDatum: '2027-05-01',
        kommentar: '',
      }, []),
    );
    expect(onClose).toHaveBeenCalled();
  });

  describe('Menge beim Anlegen', () => {
    const srf: GeraetBestand = {
      id: 'b1',
      geraetId: 'g1',
      lagerortKey: 'fahrzeug|srf|gr 2',
      lagerort: { art: 'fahrzeug', fahrzeug: 'SRF', laderaum: 'GR 2' },
      anzahl: 4,
    };
    const ohne: GeraetBestand = {
      id: 'bu',
      geraetId: 'g1',
      lagerortKey: 'unbestimmt',
      lagerort: { art: 'unbestimmt' },
      anzahl: 1,
    };

    function renderNew(bestaende: GeraetBestand[]) {
      renderWithIntl(
        <ChargeDialog
          open
          groupId="ffnd"
          geraetId="g1"
          bestaende={bestaende}
          einheit="Sack"
          onClose={onClose}
        />,
      );
    }

    it('bucht die Mengen je Lagerort und ohne Lagerort als Zugang', async () => {
      const user = userEvent.setup();
      renderNew([srf]);
      await user.type(screen.getByLabelText('SRF · GR 2'), '3');
      await user.type(screen.getByLabelText('ohne Lagerort'), '2');
      await user.click(screen.getByRole('button', { name: 'Speichern' }));
      await waitFor(() =>
        expect(saveGeraetCharge).toHaveBeenCalledWith('ffnd', 'g1', expect.any(Object), [
          { bestandId: 'b1', menge: 3 },
          { bestandId: null, menge: 2 },
        ]),
      );
    });

    it('nimmt einen vorhandenen Lagerort „ohne Lagerort" und keine zweite Zeile', async () => {
      const user = userEvent.setup();
      renderNew([srf, ohne]);
      expect(screen.getAllByLabelText('ohne Lagerort')).toHaveLength(1);
      await user.type(screen.getByLabelText('ohne Lagerort'), '5');
      await user.click(screen.getByRole('button', { name: 'Speichern' }));
      await waitFor(() =>
        expect(saveGeraetCharge).toHaveBeenCalledWith('ffnd', 'g1', expect.any(Object), [
          { bestandId: 'bu', menge: 5 },
        ]),
      );
    });

    it('meldet eine ungültige Menge und speichert nicht', async () => {
      const user = userEvent.setup();
      renderNew([srf]);
      await user.type(screen.getByLabelText('SRF · GR 2'), 'abc');
      await user.click(screen.getByRole('button', { name: 'Speichern' }));
      expect(screen.getByText('Bitte eine Zahl ab 0 angeben.')).toBeInTheDocument();
      expect(saveGeraetCharge).not.toHaveBeenCalled();
    });

  });

  describe('Bestand beim Bearbeiten korrigieren', () => {
    const srf: GeraetBestand = {
      id: 'b1',
      geraetId: 'g1',
      lagerortKey: 'fahrzeug|srf|gr 2',
      lagerort: { art: 'fahrzeug', fahrzeug: 'SRF', laderaum: 'GR 2' },
      anzahl: 6,
      chargen: { c1: 4 },
    };
    const lager: GeraetBestand = {
      id: 'b2',
      geraetId: 'g1',
      lagerortKey: 'raum|feuerwehrhaus|lager',
      lagerort: { art: 'raum', standort: 'Feuerwehrhaus', raum: 'Lager' },
      anzahl: 2,
    };

    function renderEdit(bestaende: GeraetBestand[] = [srf, lager]) {
      renderWithIntl(
        <ChargeDialog
          open
          groupId="ffnd"
          geraetId="g1"
          charge={charge}
          bestaende={bestaende}
          onClose={onClose}
        />,
      );
    }

    it('zeigt die Menge der Charge je Lagerort vorbefüllt', () => {
      renderEdit();
      expect(screen.getByText('Bestand dieser Charge je Lagerort')).toBeInTheDocument();
      expect(
        screen.getByText('Gezählte Menge eintragen – die Differenz wird als Inventur gebucht.'),
      ).toBeInTheDocument();
      expect(screen.getByLabelText('SRF · GR 2')).toHaveValue('4');
      expect(screen.getByLabelText('Feuerwehrhaus · Lager')).toHaveValue('0');
      expect(screen.getByLabelText('ohne Lagerort')).toHaveValue('0');
    });

    it('speichert die Charge und korrigiert nur die geänderten Zeilen', async () => {
      const user = userEvent.setup();
      renderEdit();
      const srfField = screen.getByLabelText('SRF · GR 2');
      await user.clear(srfField);
      await user.type(srfField, '3');
      const ohne = screen.getByLabelText('ohne Lagerort');
      await user.clear(ohne);
      await user.type(ohne, '2');
      await user.click(screen.getByRole('button', { name: 'Speichern' }));
      await waitFor(() =>
        expect(korrigiereGeraetChargenBestand).toHaveBeenCalledWith(
          'ffnd',
          'g1',
          [
            { bestandId: 'b1', chargeId: 'c1', menge: 3 },
            { bestandId: null, chargeId: 'c1', menge: 2 },
          ],
          'Korrektur Charge',
        ),
      );
      expect(saveGeraetCharge).toHaveBeenCalledWith(
        'ffnd',
        'g1',
        expect.objectContaining({ id: 'c1' }),
      );
      expect(saveGeraetCharge.mock.invocationCallOrder[0]).toBeLessThan(
        korrigiereGeraetChargenBestand.mock.invocationCallOrder[0],
      );
      expect(onClose).toHaveBeenCalled();
    });

    it('korrigiert nichts, wenn keine Menge geändert wurde', async () => {
      const user = userEvent.setup();
      renderEdit();
      await user.click(screen.getByRole('button', { name: 'Speichern' }));
      await waitFor(() => expect(onClose).toHaveBeenCalled());
      expect(saveGeraetCharge).toHaveBeenCalled();
      expect(korrigiereGeraetChargenBestand).not.toHaveBeenCalled();
    });

    it('meldet eine ungültige Menge und speichert nicht', async () => {
      const user = userEvent.setup();
      renderEdit();
      const srfField = screen.getByLabelText('SRF · GR 2');
      await user.clear(srfField);
      await user.type(srfField, '-1');
      await user.click(screen.getByRole('button', { name: 'Speichern' }));
      expect(screen.getByText('Bitte eine Zahl ab 0 angeben.')).toBeInTheDocument();
      expect(saveGeraetCharge).not.toHaveBeenCalled();
      expect(korrigiereGeraetChargenBestand).not.toHaveBeenCalled();
    });

    it('zeigt einen Fehler der Korrektur und bleibt offen', async () => {
      korrigiereGeraetChargenBestand.mockRejectedValue(new Error('forbidden'));
      const user = userEvent.setup();
      renderEdit();
      const srfField = screen.getByLabelText('SRF · GR 2');
      await user.clear(srfField);
      await user.type(srfField, '5');
      await user.click(screen.getByRole('button', { name: 'Speichern' }));
      expect(await screen.findByText('Speichern fehlgeschlagen: forbidden')).toBeInTheDocument();
      expect(onClose).not.toHaveBeenCalled();
    });
  });

  it('begrenzt die Textfelder auf die Höchstlänge', () => {
    renderWithIntl(<ChargeDialog open groupId="ffnd" geraetId="g1" onClose={onClose} />);
    for (const label of ['Bezeichnung', 'LOT / Chargennummer', 'Kommentar']) {
      expect(screen.getByLabelText(label)).toHaveAttribute(
        'maxlength',
        String(GERAET_CHARGE_MAX_TEXT),
      );
    }
  });

  it('ändert eine vorhandene Charge mit ihrer ID', async () => {
    const user = userEvent.setup();
    renderWithIntl(
      <ChargeDialog open groupId="ffnd" geraetId="g1" charge={charge} onClose={onClose} />,
    );
    expect(screen.getByLabelText('Bezeichnung')).toHaveValue('Lieferung März');
    await user.type(screen.getByLabelText('Kommentar'), 'Regal 3');
    await user.click(screen.getByRole('button', { name: 'Speichern' }));
    await waitFor(() =>
      expect(saveGeraetCharge).toHaveBeenCalledWith(
        'ffnd',
        'g1',
        expect.objectContaining({
          id: 'c1',
          bezeichnung: 'Lieferung März',
          produktionsNummer: 'L-42',
          ablaufDatum: '2027-03-31',
          kommentar: 'Regal 3',
        }),
      ),
    );
  });

  it('zeigt einen Fehler der Action und bleibt offen', async () => {
    saveGeraetCharge.mockRejectedValue(new Error('forbidden'));
    const user = userEvent.setup();
    renderWithIntl(<ChargeDialog open groupId="ffnd" geraetId="g1" onClose={onClose} />);
    await user.click(screen.getByRole('button', { name: 'Speichern' }));
    expect(await screen.findByText('Speichern fehlgeschlagen: forbidden')).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });
});
