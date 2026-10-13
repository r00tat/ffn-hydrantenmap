// @vitest-environment jsdom
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom/vitest';
import { renderWithIntl as render } from '../../test-utils/intlRender';
import { FirecallItem, Fzg } from '../firebase/firestore';

const addItem = vi.fn();
const showSnackbar = vi.fn();

vi.mock('../../hooks/useFirecallItemAdd', () => ({
  default: () => addItem,
}));
vi.mock('../../hooks/useFirecall', () => ({
  default: () => ({ id: 'fc1', fw: 'Neusiedl am See', lat: 47.9, lng: 16.8 }),
}));
vi.mock('../../hooks/useKostenersatzVehicles', () => ({
  useKostenersatzVehicles: () => ({
    vehicles: [
      { id: 'k1', name: 'KDTFA' },
      { id: 'k2', name: 'TLFA 4000' },
    ],
  }),
}));
vi.mock('../providers/SnackbarProvider', () => ({
  useSnackbar: () => showSnackbar,
}));

import EinsatzmittelQuickAdd from './EinsatzmittelQuickAdd';

const existing = [
  { id: 'v1', type: 'vehicle', name: 'KDTFA', fw: 'Neusiedl am See' } as Fzg,
] as FirecallItem[];

describe('EinsatzmittelQuickAdd', () => {
  beforeEach(() => {
    addItem.mockReset();
    addItem.mockResolvedValue({ id: 'new' });
    showSnackbar.mockReset();
  });

  it('legt ein Fahrzeug einer Nachbarwehr per Enter an und behält die Feuerwehr', async () => {
    const user = userEvent.setup();
    render(<EinsatzmittelQuickAdd items={existing} />);

    const fw = screen.getByRole('combobox', { name: 'Feuerwehr / Organisation' });
    await user.clear(fw);
    await user.type(fw, 'Weiden am See');
    expect(screen.getByRole('checkbox', { name: 'Fremd' })).toBeChecked();

    await user.type(screen.getByLabelText('Besatzung 1:?'), '1:5');
    const name = screen.getByRole('combobox', { name: 'Bezeichnung' });
    await user.type(name, 'RLFA 3000{Enter}');

    await waitFor(() => expect(addItem).toHaveBeenCalledTimes(1));
    expect(addItem.mock.calls[0][0]).toMatchObject({
      type: 'vehicle',
      name: 'RLFA 3000',
      fw: 'Weiden am See',
      besatzung: '5',
      fremd: 'true',
      lat: 47.9,
      lng: 16.8,
    });
    expect(addItem.mock.calls[0][0].eintreffen).toBeDefined();

    await waitFor(() => expect(name).toHaveValue(''));
    expect(name).toHaveFocus();
    expect(fw).toHaveValue('Weiden am See');
    expect(screen.getByLabelText('Besatzung 1:?')).toHaveValue('');
  });

  it('legt eine taktische Einheit mit Gesamtstärke an', async () => {
    const user = userEvent.setup();
    render(<EinsatzmittelQuickAdd items={existing} />);

    await user.click(screen.getByRole('button', { name: 'Taktische Einheit' }));
    expect(screen.queryByRole('checkbox', { name: 'Fremd' })).not.toBeInTheDocument();

    await user.type(screen.getByLabelText('Stärke'), '1:8');
    await user.type(screen.getByLabelText('ATS'), '4');
    await user.type(screen.getByRole('combobox', { name: 'Bezeichnung' }), '1. Zug');
    await user.click(screen.getByRole('button', { name: 'Hinzufügen' }));

    await waitFor(() => expect(addItem).toHaveBeenCalledTimes(1));
    expect(addItem.mock.calls[0][0]).toMatchObject({
      type: 'tacticalUnit',
      name: '1. Zug',
      unitType: 'zug',
      fw: 'Neusiedl am See',
      mann: 9,
      ats: 4,
    });
  });

  it('legt eigene Fahrzeuge mit einem Klick auf den Chip an', async () => {
    const user = userEvent.setup();
    render(<EinsatzmittelQuickAdd items={existing} />);

    // Bereits im Einsatz: nicht ein zweites Mal anlegbar.
    expect(screen.getByText('KDTFA').closest('.MuiChip-root')).toHaveClass(
      'Mui-disabled',
    );

    await user.click(screen.getByRole('button', { name: 'TLFA 4000' }));
    await waitFor(() => expect(addItem).toHaveBeenCalledTimes(1));
    expect(addItem.mock.calls[0][0]).toMatchObject({
      type: 'vehicle',
      name: 'TLFA 4000',
      fw: 'Neusiedl am See',
    });
    expect(addItem.mock.calls[0][0].fremd).toBeUndefined();
  });

  it('legt ohne Bezeichnung nichts an', async () => {
    render(<EinsatzmittelQuickAdd items={existing} />);
    expect(screen.getByRole('button', { name: 'Hinzufügen' })).toBeDisabled();
  });
});
