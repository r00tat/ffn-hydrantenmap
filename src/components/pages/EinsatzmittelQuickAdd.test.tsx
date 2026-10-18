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
    // Eine Nachbarwehr ist Feuerwehr, keine Fremdorganisation.
    expect(screen.getByRole('checkbox', { name: 'Fremd' })).not.toBeChecked();

    await user.type(screen.getByLabelText('Besatzung 1:?'), '1:5');
    const name = screen.getByRole('combobox', { name: 'Bezeichnung' });
    await user.type(name, 'RLFA 3000{Enter}');

    await waitFor(() => expect(addItem).toHaveBeenCalledTimes(1));
    expect(addItem.mock.calls[0][0]).toMatchObject({
      type: 'vehicle',
      name: 'RLFA 3000',
      fw: 'Weiden am See',
      besatzung: '5',
      lat: 47.9,
      lng: 16.8,
    });
    expect(addItem.mock.calls[0][0].eintreffen).toBeDefined();
    expect(addItem.mock.calls[0][0].fremd).toBeUndefined();

    await waitFor(() => expect(name).toHaveValue(''));
    expect(name).toHaveFocus();
    expect(fw).toHaveValue('Weiden am See');
    expect(screen.getByLabelText('Besatzung 1:?')).toHaveValue('');
  });

  it('lässt die Feuerwehr beim Fahrzeug leer', async () => {
    const user = userEvent.setup();
    render(<EinsatzmittelQuickAdd items={existing} />);

    const fw = () => screen.getByRole('combobox', { name: 'Feuerwehr / Organisation' });
    expect(fw()).toHaveValue('');
    expect(screen.getByRole('checkbox', { name: 'Fremd' })).not.toBeChecked();

    await user.type(fw(), 'Weiden am See');
    await user.click(screen.getByRole('button', { name: 'Taktische Einheit' }));
    await user.click(screen.getByRole('button', { name: 'Fahrzeug' }));
    expect(fw()).toHaveValue('');
  });

  it('markiert eine Fremdorganisation nur auf Klick', async () => {
    const user = userEvent.setup();
    render(<EinsatzmittelQuickAdd items={existing} />);

    await user.type(
      screen.getByRole('combobox', { name: 'Feuerwehr / Organisation' }),
      'Rotes Kreuz',
    );
    const fremd = screen.getByRole('checkbox', { name: 'Fremd' });
    expect(fremd).not.toBeChecked();
    await user.click(fremd);
    await user.type(screen.getByRole('combobox', { name: 'Bezeichnung' }), 'RTW{Enter}');

    await waitFor(() => expect(addItem).toHaveBeenCalledTimes(1));
    expect(addItem.mock.calls[0][0]).toMatchObject({
      name: 'RTW',
      fw: 'Rotes Kreuz',
      fremd: 'true',
    });
  });

  it('legt eine taktische Einheit mit Gesamtstärke an', async () => {
    const user = userEvent.setup();
    render(<EinsatzmittelQuickAdd items={existing} />);

    await user.click(screen.getByRole('button', { name: 'Taktische Einheit' }));
    expect(screen.queryByRole('checkbox', { name: 'Fremd' })).not.toBeInTheDocument();
    // Die Einheit heißt, wie sie gemeldet wird — keine Feuerwehr daneben.
    expect(
      screen.queryByRole('combobox', { name: 'Feuerwehr / Organisation' }),
    ).not.toBeInTheDocument();

    await user.type(screen.getByLabelText('Stärke'), '1:8');
    await user.type(screen.getByLabelText('ATS'), '4');
    await user.type(screen.getByRole('combobox', { name: 'Bezeichnung' }), '1. Zug');
    await user.click(screen.getByRole('button', { name: 'Hinzufügen' }));

    await waitFor(() => expect(addItem).toHaveBeenCalledTimes(1));
    expect(addItem.mock.calls[0][0]).toMatchObject({
      type: 'tacticalUnit',
      name: '1. Zug',
      unitType: 'zug',
      mann: 9,
      ats: 4,
    });
    expect(addItem.mock.calls[0][0]).not.toHaveProperty('fw');
  });

  it('legt nach einer Einheit gleich ihre Fahrzeuge an', async () => {
    const user = userEvent.setup();
    addItem.mockResolvedValueOnce({ id: 'u-new' });
    render(<EinsatzmittelQuickAdd items={existing} />);

    await user.click(screen.getByRole('button', { name: 'Taktische Einheit' }));
    await user.type(
      screen.getByRole('combobox', { name: 'Bezeichnung' }),
      'FW Neusiedl{Enter}',
    );
    await waitFor(() => expect(addItem).toHaveBeenCalledTimes(1));

    // Danach steht die Eingabe auf „Fahrzeug" unter der neuen Einheit.
    expect(screen.getByRole('button', { name: 'Fahrzeug' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(
      screen.getByRole('combobox', { name: 'Feuerwehr / Organisation' }),
    ).toHaveValue('');
    await user.type(
      screen.getByRole('combobox', { name: 'Bezeichnung' }),
      'RLF{Enter}',
    );
    await waitFor(() => expect(addItem).toHaveBeenCalledTimes(2));
    expect(addItem.mock.calls[1][0]).toMatchObject({
      type: 'vehicle',
      name: 'RLF',
      tacticalUnitId: 'u-new',
    });
  });

  it('legt einen Zug unter einer bestehenden Bereitschaft an', async () => {
    const user = userEvent.setup();
    render(
      <EinsatzmittelQuickAdd
        items={[
          ...existing,
          { id: 'b1', type: 'tacticalUnit', name: 'KHD Bereitschaft' } as FirecallItem,
        ]}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Taktische Einheit' }));
    await user.click(screen.getByRole('combobox', { name: 'Übergeordnete Einheit' }));
    await user.click(screen.getByRole('option', { name: 'KHD Bereitschaft' }));
    await user.type(screen.getByRole('combobox', { name: 'Bezeichnung' }), '1. Zug{Enter}');

    await waitFor(() => expect(addItem).toHaveBeenCalledTimes(1));
    expect(addItem.mock.calls[0][0]).toMatchObject({
      type: 'tacticalUnit',
      name: '1. Zug',
      tacticalUnitId: 'b1',
    });
  });

  it('ordnet ein Fahrzeug einer bestehenden Einheit zu', async () => {
    const user = userEvent.setup();
    render(
      <EinsatzmittelQuickAdd
        items={[
          ...existing,
          { id: 'u1', type: 'tacticalUnit', name: 'Zug Nord' } as FirecallItem,
        ]}
      />,
    );

    await user.click(screen.getByRole('combobox', { name: 'Einheit' }));
    await user.click(screen.getByRole('option', { name: 'Zug Nord' }));
    await user.type(
      screen.getByRole('combobox', { name: 'Bezeichnung' }),
      'TLF{Enter}',
    );
    await waitFor(() => expect(addItem).toHaveBeenCalledTimes(1));
    expect(addItem.mock.calls[0][0]).toMatchObject({ tacticalUnitId: 'u1' });
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
