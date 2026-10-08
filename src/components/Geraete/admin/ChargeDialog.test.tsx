// @vitest-environment jsdom
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GERAET_CHARGE_MAX_TEXT, type GeraetCharge } from '../../../common/geraet';
import { renderWithIntl } from '../../../test-utils/intlRender';

const { saveGeraetCharge } = vi.hoisted(() => ({ saveGeraetCharge: vi.fn() }));

vi.mock('../geraeteActions', () => ({ saveGeraetCharge }));

import ChargeDialog from './ChargeDialog';

const charge: GeraetCharge = {
  id: 'c1',
  bezeichnung: 'Lieferung März',
  losNummer: 'L-42',
  ablaufDatum: '2027-03-31',
  createdAt: '',
  createdBy: '',
};

describe('ChargeDialog', () => {
  const onClose = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    saveGeraetCharge.mockResolvedValue({ id: 'neu' });
  });

  it('legt eine Charge an — alle Felder optional', async () => {
    const user = userEvent.setup();
    renderWithIntl(<ChargeDialog open groupId="ffnd" geraetId="g1" onClose={onClose} />);
    expect(screen.getByText('Neue Charge')).toBeInTheDocument();
    await user.type(screen.getByLabelText('Los-Nr.'), 'L-7');
    await user.type(screen.getByLabelText('Ablaufdatum'), '2027-05-01');
    await user.click(screen.getByRole('button', { name: 'Speichern' }));
    await waitFor(() =>
      expect(saveGeraetCharge).toHaveBeenCalledWith('ffnd', 'g1', {
        bezeichnung: '',
        losNummer: 'L-7',
        produktionsNummer: '',
        einkaufsDatum: '',
        ablaufDatum: '2027-05-01',
        kommentar: '',
      }),
    );
    expect(onClose).toHaveBeenCalled();
  });

  it('begrenzt die Textfelder auf die Höchstlänge', () => {
    renderWithIntl(<ChargeDialog open groupId="ffnd" geraetId="g1" onClose={onClose} />);
    for (const label of ['Bezeichnung', 'Los-Nr.', 'Produktionsnummer', 'Kommentar']) {
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
          losNummer: 'L-42',
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
