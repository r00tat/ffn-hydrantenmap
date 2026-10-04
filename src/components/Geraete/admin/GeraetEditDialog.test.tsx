// @vitest-environment jsdom
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Geraet } from '../../../common/geraet';
import { renderWithIntl } from '../../../test-utils/intlRender';

const { saveGeraet, deleteGeraet } = vi.hoisted(() => ({
  saveGeraet: vi.fn(),
  deleteGeraet: vi.fn(),
}));

vi.mock('../geraeteActions', () => ({ saveGeraet, deleteGeraet }));

import GeraetEditDialog from './GeraetEditDialog';

function vlies(over: Partial<Geraet> = {}): Geraet {
  return {
    id: 'g1',
    externeId: 'g1',
    bezeichnung: 'Bindevlies Economy',
    verbrauchsmaterial: true,
    einheit: 'Sack',
    mindestbestand: 10,
    bestandGesamt: 4,
    active: true,
    createdAt: '',
    createdBy: '',
    updatedAt: '',
    updatedBy: '',
    ...over,
  };
}

describe('GeraetEditDialog', () => {
  const onClose = vi.fn();
  const onDone = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    saveGeraet.mockResolvedValue({ id: 'g1' });
    deleteGeraet.mockResolvedValue({ id: 'g1', deleted: true });
  });

  function render(geraet?: Geraet) {
    return renderWithIntl(
      <GeraetEditDialog
        open
        groupId="ffnd"
        geraet={geraet}
        onClose={onClose}
        onDone={onDone}
      />,
    );
  }

  it('verlangt beim Anlegen eine Bezeichnung', async () => {
    const user = userEvent.setup();
    render();
    await user.click(screen.getByRole('button', { name: 'Speichern' }));
    expect(await screen.findByText('Bitte eine Bezeichnung angeben.')).toBeInTheDocument();
    expect(saveGeraet).not.toHaveBeenCalled();
  });

  it('legt einen Artikel ohne ID an', async () => {
    const user = userEvent.setup();
    render();
    await user.type(screen.getByLabelText(/Bezeichnung/), 'Ölbinder');
    await user.click(screen.getByRole('button', { name: 'Speichern' }));
    await waitFor(() => expect(saveGeraet).toHaveBeenCalled());
    const [groupId, input] = saveGeraet.mock.calls[0];
    expect(groupId).toBe('ffnd');
    expect(input).not.toHaveProperty('id');
    expect(input).toMatchObject({ bezeichnung: 'Ölbinder', active: true });
    expect(onDone).toHaveBeenCalledWith('saved');
    expect(onClose).toHaveBeenCalled();
  });

  it('speichert den geänderten Mindestbestand', async () => {
    const user = userEvent.setup();
    render(vlies());
    const min = screen.getByLabelText('Mindestbestand');
    await user.clear(min);
    await user.type(min, '8');
    await user.click(screen.getByRole('button', { name: 'Speichern' }));
    await waitFor(() =>
      expect(saveGeraet).toHaveBeenCalledWith(
        'ffnd',
        expect.objectContaining({
          id: 'g1',
          mindestbestand: 8,
          verbrauchsmaterial: true,
          einheit: 'Sack',
        }),
      ),
    );
  });

  it('löscht den Mindestbestand, wenn der Artikel kein Verbrauchsmaterial mehr ist', async () => {
    const user = userEvent.setup();
    render(vlies());
    await user.click(screen.getByRole('switch', { name: 'Verbrauchsmaterial' }));
    expect(screen.getByLabelText('Mindestbestand')).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Speichern' }));
    await waitFor(() =>
      expect(saveGeraet).toHaveBeenCalledWith(
        'ffnd',
        expect.objectContaining({ verbrauchsmaterial: false, mindestbestand: null }),
      ),
    );
  });

  it('schickt geleerte Felder als leeren Text, damit sie am Artikel entfallen', async () => {
    const user = userEvent.setup();
    render(vlies());
    await user.clear(screen.getByLabelText(/^Einheit/));
    await user.click(screen.getByRole('button', { name: 'Speichern' }));
    await waitFor(() =>
      expect(saveGeraet).toHaveBeenCalledWith(
        'ffnd',
        expect.objectContaining({ einheit: '' }),
      ),
    );
  });

  it('lehnt einen negativen Mindestbestand ab', async () => {
    const user = userEvent.setup();
    render(vlies());
    const min = screen.getByLabelText('Mindestbestand');
    await user.clear(min);
    await user.type(min, '-3');
    await user.click(screen.getByRole('button', { name: 'Speichern' }));
    expect(
      await screen.findByText('Der Mindestbestand muss eine ganze Zahl ab 0 sein.'),
    ).toBeInTheDocument();
    expect(saveGeraet).not.toHaveBeenCalled();
  });

  it('zeigt einen Fehler der Action und bleibt offen', async () => {
    saveGeraet.mockRejectedValue(new Error('forbidden'));
    const user = userEvent.setup();
    render(vlies());
    await user.click(screen.getByRole('button', { name: 'Speichern' }));
    expect(
      await screen.findByText('Speichern fehlgeschlagen: forbidden'),
    ).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('löscht nach Rückfrage', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const user = userEvent.setup();
    render(vlies());
    await user.click(screen.getByRole('button', { name: 'Löschen' }));
    await waitFor(() => expect(deleteGeraet).toHaveBeenCalledWith('ffnd', 'g1'));
    expect(onDone).toHaveBeenCalledWith('deleted');
  });
});
