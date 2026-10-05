// @vitest-environment jsdom
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Geraet, GeraetBestand } from '../../../common/geraet';
import { renderWithIntl } from '../../../test-utils/intlRender';

const { createGeraetBestand, updateGeraetBestand } = vi.hoisted(() => ({
  createGeraetBestand: vi.fn(),
  updateGeraetBestand: vi.fn(),
}));

vi.mock('../geraeteActions', () => ({ createGeraetBestand, updateGeraetBestand }));

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
});

