// @vitest-environment jsdom
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  GERAET_CHARGE_MAX_TEXT,
  type Geraet,
  type GeraetBestand,
} from '../../../common/geraet';
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

  describe('Chargen', () => {
    const mitChargen: Geraet = {
      ...geraet,
      chargen: [
        { id: 'c1', losNummer: 'A1', ablaufDatum: '2027-01-31', createdAt: '', createdBy: '' },
        { id: 'c2', bezeichnung: 'Lieferung Mai', createdAt: '', createdBy: '' },
        { id: 'c3', bezeichnung: 'Alt', archiviert: true, createdAt: '', createdBy: '' },
      ],
    };
    const lagerMitChargen: GeraetBestand = { ...lager, chargen: { c1: 2 } };

    function renderChargen(
      mode: BestandBookingMode,
      item: Geraet = mitChargen,
      bestand: GeraetBestand = lagerMitChargen,
    ) {
      return renderWithIntl(
        <BestandBookingDialog
          open
          groupId="ffnd"
          geraet={item}
          bestand={bestand}
          bestaende={[bestand, srf]}
          mode={mode}
          onClose={onClose}
        />,
      );
    }

    it('bucht einen Zugang auf eine vorhandene Charge', async () => {
      const user = userEvent.setup();
      renderChargen('zugang');
      await user.click(screen.getByRole('combobox', { name: 'Charge' }));
      expect(screen.queryByRole('option', { name: /Alt/ })).toBeNull();
      await user.click(screen.getByRole('option', { name: /Lieferung Mai/ }));
      await user.type(screen.getByLabelText('Menge'), '3');
      await user.click(screen.getByRole('button', { name: 'Buchen' }));
      await waitFor(() =>
        expect(bookGeraetBestand).toHaveBeenCalledWith('ffnd', {
          art: 'zugang',
          bestandId: 'b-lager',
          menge: 3,
          bemerkung: undefined,
          chargeId: 'c2',
        }),
      );
    });

    it('bucht einen Zugang mit einer neuen Charge', async () => {
      const user = userEvent.setup();
      renderChargen('zugang', geraet, lager);
      await user.click(screen.getByRole('combobox', { name: 'Charge' }));
      await user.click(screen.getByRole('option', { name: 'Neue Charge…' }));
      await user.type(screen.getByLabelText('Los-Nr.'), 'L-9');
      await user.type(screen.getByLabelText('Ablaufdatum'), '2028-02-29');
      await user.type(screen.getByLabelText('Menge'), '4');
      await user.click(screen.getByRole('button', { name: 'Buchen' }));
      await waitFor(() =>
        expect(bookGeraetBestand).toHaveBeenCalledWith('ffnd', {
          art: 'zugang',
          bestandId: 'b-lager',
          menge: 4,
          bemerkung: undefined,
          neueCharge: { losNummer: 'L-9', ablaufDatum: '2028-02-29' },
        }),
      );
    });

    it('bietet bei einem Gerät keine Charge an', () => {
      renderChargen('zugang', { ...geraet, verbrauchsmaterial: false }, lager);
      expect(screen.queryByRole('combobox', { name: 'Charge' })).toBeNull();
    });

    it('bucht eine Umbuchung automatisch oder mit gewählter Charge', async () => {
      const user = userEvent.setup();
      renderChargen('umbuchung');
      expect(screen.getByRole('combobox', { name: 'Charge' })).toHaveTextContent(
        'automatisch (älteste zuerst)',
      );
      await user.click(screen.getByRole('combobox', { name: 'Charge' }));
      await user.click(screen.getByRole('option', { name: /Los A1/ }));
      await user.type(screen.getByLabelText('Menge'), '1');
      await user.click(screen.getByRole('button', { name: 'Buchen' }));
      await waitFor(() =>
        expect(bookGeraetBestand).toHaveBeenCalledWith('ffnd', {
          art: 'umbuchung',
          bestandId: 'b-lager',
          zielBestandId: 'b-srf',
          menge: 1,
          bemerkung: undefined,
          chargeId: 'c1',
        }),
      );
    });

    it('ohne aktive Chargen keine Auswahl bei der Umbuchung', () => {
      renderChargen('umbuchung', geraet, lager);
      expect(screen.queryByRole('combobox', { name: 'Charge' })).toBeNull();
    });

    it('zählt bei der Inventur je Charge', async () => {
      const user = userEvent.setup();
      renderChargen('inventur');
      await user.click(screen.getByRole('switch', { name: 'je Charge zählen' }));
      expect(screen.queryByLabelText('Gezählter Bestand')).toBeNull();
      expect(screen.getByLabelText('Los A1')).toHaveValue(2);
      expect(screen.getByLabelText('ohne Charge')).toHaveValue(4);
      await user.type(screen.getByLabelText('Lieferung Mai'), '3');
      const ohne = screen.getByLabelText('ohne Charge');
      await user.clear(ohne);
      await user.type(ohne, '1');
      await user.click(screen.getByRole('button', { name: 'Buchen' }));
      await waitFor(() =>
        expect(bookGeraetBestand).toHaveBeenCalledWith('ffnd', {
          art: 'inventur',
          bestandId: 'b-lager',
          istWert: 6,
          bemerkung: undefined,
          istWertJeCharge: { c1: 2, c2: 3 },
          istWertOhneCharge: 1,
        }),
      );
    });

    it('belegt eine negative Charge bei der Zählung mit 0 vor', async () => {
      const user = userEvent.setup();
      renderChargen('inventur', mitChargen, { ...lager, chargen: { c1: -2 } });
      await user.click(screen.getByRole('switch', { name: 'je Charge zählen' }));
      expect(screen.getByLabelText('Los A1')).toHaveValue(0);
      expect(screen.getByLabelText('ohne Charge')).toHaveValue(8);
      await user.click(screen.getByRole('button', { name: 'Buchen' }));
      await waitFor(() =>
        expect(bookGeraetBestand).toHaveBeenCalledWith('ffnd', {
          art: 'inventur',
          bestandId: 'b-lager',
          istWert: 8,
          bemerkung: undefined,
          istWertJeCharge: {},
          istWertOhneCharge: 8,
        }),
      );
    });

    it('begrenzt die Texte einer neuen Charge', async () => {
      const user = userEvent.setup();
      renderChargen('zugang', geraet, lager);
      await user.click(screen.getByRole('combobox', { name: 'Charge' }));
      await user.click(screen.getByRole('option', { name: 'Neue Charge…' }));
      for (const label of ['Bezeichnung', 'Los-Nr.']) {
        expect(screen.getByLabelText(label)).toHaveAttribute(
          'maxlength',
          String(GERAET_CHARGE_MAX_TEXT),
        );
      }
    });

    it('bietet die Zählung je Charge nur an, wenn es Chargen gibt', () => {
      renderChargen('inventur', geraet, lager);
      expect(screen.queryByRole('switch', { name: 'je Charge zählen' })).toBeNull();
    });
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
