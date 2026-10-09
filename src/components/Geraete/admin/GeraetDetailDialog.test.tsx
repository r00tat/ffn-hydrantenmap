// @vitest-environment jsdom
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  GERAET_CHARGE_MAX_TEXT,
  type Geraet,
  type GeraetBestand,
} from '../../../common/geraet';
import { renderWithIntl } from '../../../test-utils/intlRender';

const {
  deleteGeraetBestand,
  saveGeraet,
  archiveGeraetCharge,
  ausbuchenGeraetCharge,
  lagerortDialogProps,
} = vi.hoisted(() => ({
  deleteGeraetBestand: vi.fn(),
  saveGeraet: vi.fn(),
  archiveGeraetCharge: vi.fn(),
  ausbuchenGeraetCharge: vi.fn(),
  lagerortDialogProps: vi.fn(),
}));

vi.mock('../geraeteActions', () => ({
  deleteGeraetBestand,
  saveGeraet,
  archiveGeraetCharge,
  ausbuchenGeraetCharge,
}));
vi.mock('./GeraetHistory', () => ({ default: () => null }));
vi.mock('./ChargeDialog', () => ({
  default: (props: { charge?: { id: string } }) => (
    <div>Charge-Dialog {props.charge ? props.charge.id : 'neu'}</div>
  ),
}));
vi.mock('./ChargeSplitDialog', () => ({
  default: (props: { bestand: GeraetBestand }) => (
    <div>Aufteilen-Dialog {props.bestand.id}</div>
  ),
}));
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

function render(
  canManage = true,
  item: Geraet = geraet,
  bestaende: GeraetBestand[] = [srf],
) {
  return renderWithIntl(
    <GeraetDetailDialog
      open
      groupId="ffnd"
      geraet={item}
      bestaende={bestaende}
      allBestaende={bestaende}
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
    archiveGeraetCharge.mockResolvedValue({ id: 'c2' });
    ausbuchenGeraetCharge.mockResolvedValue({ id: 'c1', bookings: 1 });
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

  describe('Chargen', () => {
    const mitChargen: Geraet = {
      ...geraet,
      chargen: [
        { id: 'c1', produktionsNummer: 'A1', ablaufDatum: '2020-01-31', createdAt: '', createdBy: '' },
        { id: 'c2', bezeichnung: 'Lieferung Mai', createdAt: '', createdBy: '' },
        { id: 'c3', bezeichnung: 'Alt', archiviert: true, createdAt: '', createdBy: '' },
      ],
    };
    const srfMitChargen: GeraetBestand = { ...srf, anzahl: 6, chargen: { c1: 2 } };

    function renderChargen(canManage = true, bestand: GeraetBestand = srfMitChargen) {
      return render(canManage, mitChargen, [bestand]);
    }

    it('zeigt die aktiven Chargen mit Ablaufstatus und Gesamtmenge', () => {
      renderChargen();
      expect(screen.getByRole('heading', { name: 'Chargen' })).toBeInTheDocument();
      const row = screen.getByRole('row', { name: /^LOT A1/ });
      expect(row).toHaveTextContent('A1');
      expect(row).toHaveTextContent('abgelaufen');
      expect(row).toHaveTextContent('2');
      expect(screen.getByRole('row', { name: /^Lieferung Mai/ })).toBeInTheDocument();
      expect(screen.queryByText('Alt')).toBeNull();
    });

    it('zeigt archivierte Chargen nur auf Wunsch', async () => {
      const user = userEvent.setup();
      renderChargen();
      await user.click(screen.getByRole('switch', { name: 'archivierte anzeigen' }));
      expect(screen.getByText('Alt')).toBeInTheDocument();
      expect(screen.getByText('archiviert')).toBeInTheDocument();
    });

    it('gibt es bei einem Gerät nicht', () => {
      render(true, { ...mitChargen, verbrauchsmaterial: false }, [srf]);
      expect(screen.queryByRole('heading', { name: 'Chargen' })).toBeNull();
    });

    it('zeigt am Lagerort die Menge je Charge und ohne Charge', () => {
      renderChargen();
      expect(screen.getByText('LOT A1: 2')).toBeInTheDocument();
      expect(screen.getByText('ohne Charge: 4')).toBeInTheDocument();
    });

    it('warnt bei negativem Rest ohne Charge', () => {
      renderChargen(true, { ...srfMitChargen, anzahl: 1 });
      expect(screen.getByText('ohne Charge: -1')).toBeInTheDocument();
      expect(screen.getByText(/Negativer Bestand bei einer Charge/)).toBeInTheDocument();
    });

    it('zeigt an einem nicht aufgeteilten Lagerort ohne Bestand keine Chargen-Chips', () => {
      renderChargen(true, { ...srf, anzahl: -3, chargen: undefined });
      expect(screen.queryByText(/ohne Charge/)).toBeNull();
      expect(screen.queryByText(/Negativer Bestand bei einer Charge/)).toBeNull();
    });

    it('öffnet den Dialog zum Anlegen und Bearbeiten', async () => {
      const user = userEvent.setup();
      renderChargen();
      await user.click(screen.getByRole('button', { name: 'Charge anlegen' }));
      expect(screen.getByText('Charge-Dialog neu')).toBeInTheDocument();
      const row = screen.getByRole('row', { name: /^LOT A1/ });
      await user.click(within(row).getByRole('button', { name: 'Charge bearbeiten' }));
      expect(screen.getByText('Charge-Dialog c1')).toBeInTheDocument();
    });

    it('bucht eine Charge nach Rückfrage mit Bemerkung aus', async () => {
      const user = userEvent.setup();
      renderChargen();
      const row = screen.getByRole('row', { name: /^LOT A1/ });
      await user.click(within(row).getByRole('button', { name: 'Ausbuchen' }));
      expect(screen.getByText(/„LOT A1“ \(2 Sack\)/)).toBeInTheDocument();
      expect(screen.getByLabelText('Bemerkung')).toHaveAttribute(
        'maxlength',
        String(GERAET_CHARGE_MAX_TEXT),
      );
      await user.type(screen.getByLabelText('Bemerkung'), 'abgelaufen');
      await user.click(
        within(screen.getByRole('dialog', { name: 'Charge ausbuchen?' })).getByRole('button', {
          name: 'Ausbuchen',
        }),
      );
      await waitFor(() =>
        expect(ausbuchenGeraetCharge).toHaveBeenCalledWith('ffnd', 'g1', 'c1', 'abgelaufen'),
      );
    });

    it('archiviert nur eine Charge ohne Bestand', async () => {
      const user = userEvent.setup();
      renderChargen();
      const withStock = screen.getByRole('row', { name: /^LOT A1/ });
      expect(within(withStock).getByRole('button', { name: 'Archivieren' })).toBeDisabled();
      const empty = screen.getByRole('row', { name: /^Lieferung Mai/ });
      await user.click(within(empty).getByRole('button', { name: 'Archivieren' }));
      await waitFor(() => expect(archiveGeraetCharge).toHaveBeenCalledWith('ffnd', 'g1', 'c2'));
    });

    it('öffnet das Aufteilen eines Lagerorts', async () => {
      const user = userEvent.setup();
      renderChargen();
      await user.click(screen.getByRole('button', { name: 'Auf Chargen aufteilen' }));
      expect(screen.getByText('Aufteilen-Dialog b1')).toBeInTheDocument();
    });

    it('ohne Pflegerecht keine Aktionen an den Chargen', () => {
      renderChargen(false);
      expect(screen.queryByRole('button', { name: 'Charge anlegen' })).toBeNull();
      expect(screen.queryByRole('button', { name: 'Ausbuchen' })).toBeNull();
      expect(screen.queryByRole('button', { name: 'Auf Chargen aufteilen' })).toBeNull();
      expect(screen.getByText('LOT A1: 2')).toBeInTheDocument();
    });
  });
});
