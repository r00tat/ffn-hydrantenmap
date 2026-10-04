// @vitest-environment jsdom
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Geraet, GeraetBestand } from '../../../common/geraet';
import { renderWithIntl } from '../../../test-utils/intlRender';

const { createGeraetBestand } = vi.hoisted(() => ({ createGeraetBestand: vi.fn() }));

vi.mock('../geraeteActions', () => ({ createGeraetBestand }));

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

describe('LagerortDialog', () => {
  const onClose = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    createGeraetBestand.mockResolvedValue({ id: 'neu' });
  });

  function render() {
    return renderWithIntl(
      <LagerortDialog
        open
        groupId="ffnd"
        geraet={geraet}
        existing={[lager]}
        allBestaende={[lager]}
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

  it('verlangt einen Standort', async () => {
    const user = userEvent.setup();
    render();
    await user.click(screen.getByRole('button', { name: 'Erstellen' }));
    expect(
      await screen.findByText('Bitte Fahrzeug bzw. Standort angeben.'),
    ).toBeInTheDocument();
  });
});
