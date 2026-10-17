// @vitest-environment jsdom
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { renderWithIntl } from '../../test-utils/intlRender';
import { Fzg, TacticalUnit } from '../firebase/firestore';
import VehicleAutocomplete from './VehicleAutocomplete';

const tlf: Fzg = { id: 'v1', name: 'TLFA 4000', type: 'vehicle', fw: 'FF Musterdorf' };
const zug: TacticalUnit = {
  id: 'u1',
  name: 'Kräfte Nord',
  type: 'tacticalUnit',
  unitType: 'zug',
};

describe('VehicleAutocomplete', () => {
  it('bietet taktische Einheiten neben Fahrzeugen an und ordnet sie zu', async () => {
    const onMapVehicleSelected = vi.fn();
    renderWithIntl(
      <VehicleAutocomplete
        value={{}}
        onChange={vi.fn()}
        mapVehicles={[tlf, zug]}
        kostenersatzVehicleNames={new Set()}
        onMapVehicleSelected={onMapVehicleSelected}
      />,
    );

    await userEvent.click(screen.getByRole('combobox'));
    expect(screen.getByRole('option', { name: /TLFA 4000/ })).toBeInTheDocument();
    const option = screen.getByRole('option', { name: /Kräfte Nord/ });
    expect(option).toHaveTextContent('Zug');

    await userEvent.click(option);
    expect(onMapVehicleSelected).toHaveBeenCalledWith('u1', 'Kräfte Nord');
  });

  it('bietet eine schon zugeordnete Einheit nicht noch einmal an', async () => {
    renderWithIntl(
      <VehicleAutocomplete
        value={{ u1: 'Kräfte Nord' }}
        onChange={vi.fn()}
        mapVehicles={[tlf, zug]}
        kostenersatzVehicleNames={new Set()}
      />,
    );

    await userEvent.click(screen.getByRole('combobox'));
    expect(screen.queryByRole('option', { name: /Kräfte Nord/ })).toBeNull();
  });
});

describe('VehicleAutocomplete – zugeordnete Einheiten', () => {
  it('zeigt den aktuellen Namen statt der gespeicherten Momentaufnahme', () => {
    renderWithIntl(
      <VehicleAutocomplete
        value={{ v1: 'TLF' }}
        onChange={vi.fn()}
        mapVehicles={[tlf, zug]}
        kostenersatzVehicleNames={new Set()}
      />,
    );

    expect(screen.getByText('TLFA 4000')).toBeInTheDocument();
    expect(screen.queryByText('TLF')).toBeNull();
  });

  it('behält den gespeicherten Namen, wenn das Element nicht mehr da ist', () => {
    renderWithIntl(
      <VehicleAutocomplete
        value={{ weg: 'KDO' }}
        onChange={vi.fn()}
        mapVehicles={[tlf]}
        kostenersatzVehicleNames={new Set()}
      />,
    );

    expect(screen.getByText('KDO')).toBeInTheDocument();
  });

  it('zeigt beim Überfahren die Feuerwehr und die Besatzung', async () => {
    renderWithIntl(
      <VehicleAutocomplete
        value={{ v1: 'TLFA 4000' }}
        onChange={vi.fn()}
        mapVehicles={[{ ...tlf, besatzung: '8' }]}
        kostenersatzVehicleNames={new Set()}
      />,
    );

    await userEvent.hover(screen.getByText('TLFA 4000'));
    const tooltip = await screen.findByRole('tooltip');
    expect(tooltip).toHaveTextContent('FF Musterdorf');
    expect(tooltip).toHaveTextContent('1:8');
  });
});
