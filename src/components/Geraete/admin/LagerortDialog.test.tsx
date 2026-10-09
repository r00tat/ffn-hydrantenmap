// @vitest-environment jsdom
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Geraet, GeraetBestand } from '../../../common/geraet';
import { renderWithIntl } from '../../../test-utils/intlRender';

const { createGeraetBestand, updateGeraetBestand, korrigiereGeraetChargenBestand } = vi.hoisted(
  () => ({
    createGeraetBestand: vi.fn(),
    updateGeraetBestand: vi.fn(),
    korrigiereGeraetChargenBestand: vi.fn(),
  }),
);

vi.mock('../geraeteActions', () => ({
  createGeraetBestand,
  updateGeraetBestand,
  korrigiereGeraetChargenBestand,
}));

import LagerortDialog from './LagerortDialog';

const geraet: Geraet = {
  id: 'g1',
  bezeichnung: 'Bindevlies Economy',
  verbrauchsmaterial: true,
  bestandGesamt: 3,
  active: true,
  createdAt: '',
  createdBy: '',
  updatedAt: '',
  updatedBy: '',
};

const lager: GeraetBestand = {
  id: 'b1',
  geraetId: 'g1',
  lagerortKey: 'raum|feuerwehrhaus|lager',
  lagerort: { art: 'raum', standort: 'Feuerwehrhaus', raum: 'Lager' },
  anzahl: 3,
};

const containers: Geraet[] = [
  { ...geraet, id: 'c1', bezeichnung: 'Ölsperren 1', kategorie: 'Container', verbrauchsmaterial: false },
  { ...geraet, id: 'c2', bezeichnung: 'Alter Container', kategorie: 'Container', active: false },
];

describe('LagerortDialog', () => {
  const onClose = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    createGeraetBestand.mockResolvedValue({ id: 'neu' });
    updateGeraetBestand.mockResolvedValue({ id: 'b1' });
    korrigiereGeraetChargenBestand.mockResolvedValue({ bookings: 1 });
  });

  function render() {
    return renderWithIntl(
      <LagerortDialog
        open
        groupId="ffnd"
        geraet={geraet}
        existing={[lager]}
        allBestaende={[lager]}
        containers={containers}
        onClose={onClose}
      />,
    );
  }

  it('legt einen Raum mit Anfangsbestand an', async () => {
    const user = userEvent.setup();
    render();
    await user.type(screen.getByLabelText(/^Standort/), 'Feuerwehrhaus');
    await user.type(screen.getByLabelText('Raum'), 'Keller');
    const anzahl = screen.getByLabelText('Anfangsbestand');
    await user.clear(anzahl);
    await user.type(anzahl, '12');
    await user.click(screen.getByRole('button', { name: 'Erstellen' }));
    await waitFor(() =>
      expect(createGeraetBestand).toHaveBeenCalledWith(
        'ffnd',
        'g1',
        { art: 'raum', standort: 'Feuerwehrhaus', raum: 'Keller' },
        12,
      ),
    );
    expect(onClose).toHaveBeenCalled();
  });

  it('nimmt einen Anfangsbestand mit Kommastelle an', async () => {
    const user = userEvent.setup();
    render();
    await user.type(screen.getByLabelText(/^Standort/), 'Feuerwehrhaus');
    await user.type(screen.getByLabelText('Raum'), 'Keller');
    const anzahl = screen.getByLabelText('Anfangsbestand');
    await user.clear(anzahl);
    await user.type(anzahl, '2.5');
    await user.click(screen.getByRole('button', { name: 'Erstellen' }));
    await waitFor(() =>
      expect(createGeraetBestand).toHaveBeenCalledWith(
        'ffnd',
        'g1',
        { art: 'raum', standort: 'Feuerwehrhaus', raum: 'Keller' },
        2.5,
      ),
    );
  });

  it('lehnt einen Lagerort ab, den der Artikel schon hat', async () => {
    const user = userEvent.setup();
    render();
    await user.type(screen.getByLabelText(/^Standort/), 'feuerwehrhaus');
    await user.type(screen.getByLabelText('Raum'), ' Lager ');
    await user.click(screen.getByRole('button', { name: 'Erstellen' }));
    expect(
      await screen.findByText('Diesen Lagerort gibt es für den Artikel schon.'),
    ).toBeInTheDocument();
    expect(createGeraetBestand).not.toHaveBeenCalled();
  });

  it('legt einen Container als Lagerort an', async () => {
    const user = userEvent.setup();
    render();
    await user.click(screen.getByLabelText('Art'));
    await user.click(await screen.findByRole('option', { name: 'Container' }));
    await user.click(screen.getByLabelText(/^Container/));
    expect(screen.queryByRole('option', { name: 'Alter Container' })).not.toBeInTheDocument();
    await user.click(await screen.findByRole('option', { name: 'Ölsperren 1' }));
    await user.click(screen.getByRole('button', { name: 'Erstellen' }));
    await waitFor(() =>
      expect(createGeraetBestand).toHaveBeenCalledWith(
        'ffnd',
        'g1',
        { art: 'container', containerId: 'c1', container: 'Ölsperren 1' },
        0,
      ),
    );
  });

  it('verlangt einen Standort', async () => {
    const user = userEvent.setup();
    render();
    await user.click(screen.getByRole('button', { name: 'Erstellen' }));
    expect(
      await screen.findByText('Bitte Fahrzeug, Container bzw. Standort angeben.'),
    ).toBeInTheDocument();
  });

  describe('bearbeiten', () => {
    const srf: GeraetBestand = {
      id: 'b2',
      geraetId: 'g1',
      lagerortKey: 'fahrzeug|srf|gr 2',
      lagerort: { art: 'fahrzeug', fahrzeug: 'SRF', laderaum: 'GR 2', bemerkung: 'oben' },
      anzahl: 2,
    };

    function renderEdit(bestand: GeraetBestand) {
      return renderWithIntl(
        <LagerortDialog
          open
          groupId="ffnd"
          geraet={geraet}
          bestand={bestand}
          existing={[lager, srf]}
          allBestaende={[lager, srf]}
          containers={containers}
          onClose={onClose}
        />,
      );
    }

    it('zeigt den Lagerort vorbefüllt, ohne Anfangsbestand, und speichert die Änderung', async () => {
      const user = userEvent.setup();
      renderEdit(srf);
      expect(screen.getByText('Lagerort bearbeiten')).toBeInTheDocument();
      expect(screen.queryByLabelText('Anfangsbestand')).toBeNull();
      const laderaum = screen.getByLabelText('Laderaum');
      expect(laderaum).toHaveValue('GR 2');
      await user.clear(laderaum);
      await user.type(laderaum, 'GR 3');
      await user.click(screen.getByRole('button', { name: 'Speichern' }));
      await waitFor(() =>
        expect(updateGeraetBestand).toHaveBeenCalledWith('ffnd', 'b2', {
          art: 'fahrzeug',
          fahrzeug: 'SRF',
          laderaum: 'GR 3',
          bemerkung: 'oben',
        }),
      );
      expect(createGeraetBestand).not.toHaveBeenCalled();
      expect(onClose).toHaveBeenCalled();
    });

    it('lehnt einen anderen vorhandenen Lagerort ab', async () => {
      const user = userEvent.setup();
      renderEdit(lager);
      const standort = screen.getByLabelText(/^Standort/);
      expect(standort).toHaveValue('Feuerwehrhaus');
      await user.click(screen.getByLabelText('Art'));
      await user.click(screen.getByRole('option', { name: 'Fahrzeug' }));
      await user.type(screen.getByLabelText(/^Fahrzeug/), 'SRF');
      await user.type(screen.getByLabelText('Laderaum'), 'GR 2');
      await user.click(screen.getByRole('button', { name: 'Speichern' }));
      expect(
        await screen.findByText('Diesen Lagerort gibt es für den Artikel schon.'),
      ).toBeInTheDocument();
      expect(updateGeraetBestand).not.toHaveBeenCalled();
    });
  });

  describe('Chargen beim Bearbeiten korrigieren', () => {
    const chargeA = {
      id: 'cA',
      produktionsNummer: 'A',
      ablaufDatum: '2026-12-01',
      createdAt: '',
      createdBy: '',
    };
    const chargeB = {
      id: 'cB',
      bezeichnung: 'Lieferung Mai',
      ablaufDatum: '2027-06-01',
      createdAt: '',
      createdBy: '',
    };
    const chargeAlt = { ...chargeB, id: 'cX', bezeichnung: 'Alt', archiviert: true };
    const mitChargen: Geraet = { ...geraet, chargen: [chargeB, chargeA, chargeAlt] };
    const bestand: GeraetBestand = { ...lager, anzahl: 10, chargen: { cA: 4, cB: 3 } };
    const ohneLagerort: GeraetBestand = {
      id: 'bu',
      geraetId: 'g1',
      lagerortKey: 'unbestimmt',
      lagerort: { art: 'unbestimmt' },
      anzahl: 2,
      chargen: { cA: 1 },
    };

    function renderEdit(item: Geraet, b: GeraetBestand) {
      return renderWithIntl(
        <LagerortDialog
          open
          groupId="ffnd"
          geraet={item}
          bestand={b}
          existing={[lager, ohneLagerort]}
          allBestaende={[lager, ohneLagerort]}
          containers={containers}
          onClose={onClose}
        />,
      );
    }

    it('zeigt je aktiver Charge und ohne Charge die Menge vorbefüllt', () => {
      renderEdit(mitChargen, bestand);
      expect(screen.getByText('Chargen an diesem Lagerort')).toBeInTheDocument();
      expect(
        screen.getByText('Gezählte Menge eintragen – die Differenz wird als Inventur gebucht.'),
      ).toBeInTheDocument();
      expect(screen.getByLabelText('LOT A')).toHaveValue('4');
      expect(screen.getByLabelText('Lieferung Mai')).toHaveValue('3');
      expect(screen.getByLabelText('ohne Charge')).toHaveValue('3');
      expect(screen.queryByLabelText('Alt')).toBeNull();
    });

    it('speichert den Lagerort und korrigiert nur die geänderten Töpfe', async () => {
      const user = userEvent.setup();
      renderEdit(mitChargen, bestand);
      const a = screen.getByLabelText('LOT A');
      await user.clear(a);
      await user.type(a, '6');
      const rest = screen.getByLabelText('ohne Charge');
      await user.clear(rest);
      await user.type(rest, '0');
      await user.click(screen.getByRole('button', { name: 'Speichern' }));
      await waitFor(() =>
        expect(korrigiereGeraetChargenBestand).toHaveBeenCalledWith(
          'ffnd',
          'g1',
          [
            { bestandId: 'b1', chargeId: 'cA', menge: 6 },
            { bestandId: 'b1', chargeId: null, menge: 0 },
          ],
          'Korrektur Lagerort',
        ),
      );
      expect(updateGeraetBestand).toHaveBeenCalledWith('ffnd', 'b1', lager.lagerort);
      expect(updateGeraetBestand.mock.invocationCallOrder[0]).toBeLessThan(
        korrigiereGeraetChargenBestand.mock.invocationCallOrder[0],
      );
      expect(onClose).toHaveBeenCalled();
    });

    it('korrigiert nichts ohne Änderung, auch bei negativem Rest', async () => {
      const user = userEvent.setup();
      renderEdit(mitChargen, { ...bestand, anzahl: 5 });
      expect(screen.getByLabelText('ohne Charge')).toHaveValue('-2');
      await user.click(screen.getByRole('button', { name: 'Speichern' }));
      await waitFor(() => expect(onClose).toHaveBeenCalled());
      expect(updateGeraetBestand).toHaveBeenCalled();
      expect(korrigiereGeraetChargenBestand).not.toHaveBeenCalled();
    });

    it('meldet eine ungültige Menge und speichert nicht', async () => {
      const user = userEvent.setup();
      renderEdit(mitChargen, bestand);
      const a = screen.getByLabelText('LOT A');
      await user.clear(a);
      await user.type(a, 'x');
      await user.click(screen.getByRole('button', { name: 'Speichern' }));
      expect(await screen.findByText('Bitte eine Zahl ab 0 angeben.')).toBeInTheDocument();
      expect(updateGeraetBestand).not.toHaveBeenCalled();
      expect(korrigiereGeraetChargenBestand).not.toHaveBeenCalled();
    });

    it('korrigiert „ohne Lagerort", ohne einen Platz zu verlangen', async () => {
      const user = userEvent.setup();
      renderEdit(mitChargen, ohneLagerort);
      expect(screen.getByLabelText('LOT A')).toHaveValue('1');
      expect(screen.getByLabelText('ohne Charge')).toHaveValue('1');
      const a = screen.getByLabelText('LOT A');
      await user.clear(a);
      await user.type(a, '2');
      await user.click(screen.getByRole('button', { name: 'Speichern' }));
      await waitFor(() =>
        expect(korrigiereGeraetChargenBestand).toHaveBeenCalledWith(
          'ffnd',
          'g1',
          [{ bestandId: 'bu', chargeId: 'cA', menge: 2 }],
          'Korrektur Lagerort',
        ),
      );
      expect(updateGeraetBestand).not.toHaveBeenCalled();
      expect(onClose).toHaveBeenCalled();
    });

    it('zeigt keine Chargen bei einem Gerät oder ohne aktive Charge', () => {
      const { unmount } = renderEdit({ ...mitChargen, verbrauchsmaterial: false }, bestand);
      expect(screen.queryByText('Chargen an diesem Lagerort')).toBeNull();
      expect(screen.queryByLabelText('ohne Charge')).toBeNull();
      unmount();
      renderEdit({ ...geraet, chargen: [chargeAlt] }, bestand);
      expect(screen.queryByText('Chargen an diesem Lagerort')).toBeNull();
    });
  });
});
