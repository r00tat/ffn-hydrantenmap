// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { CrewAssignment, Fzg } from '../firebase/firestore';

vi.mock('@dnd-kit/core', () => ({
  useDraggable: () => ({
    attributes: {},
    listeners: {},
    setNodeRef: vi.fn(),
    transform: null,
  }),
}));

import CrewPersonCard, { CrewPersonCardProps } from './CrewPersonCard';

const mockAssignment: CrewAssignment = {
  id: 'a1',
  recipientId: 'r1',
  name: 'Max Mustermann',
  vehicleId: null,
  vehicleName: '',
  funktion: 'Feuerwehrmann',
};

const mockVehicles: Fzg[] = [
  { id: 'v1', name: 'KDTFA', type: 'vehicle' },
  { id: 'v2', name: 'TLFA 4000', type: 'vehicle' },
] as Fzg[];

describe('CrewPersonCard', () => {
  let defaultProps: CrewPersonCardProps;

  beforeEach(() => {
    defaultProps = {
      assignment: mockAssignment,
      vehicles: mockVehicles,
      onFunktionChange: vi.fn(),
      onVehicleChange: vi.fn(),
    };
  });

  it('renders person name', () => {
    render(<CrewPersonCard {...defaultProps} />);
    expect(screen.getByText('Max Mustermann')).toBeInTheDocument();
  });

  it('renders Funktion select with correct current value', () => {
    render(<CrewPersonCard {...defaultProps} />);
    // MUI Select renders the current value in a div with role combobox
    const funktionSelect = screen.getByTestId('funktion-select');
    expect(funktionSelect).toBeInTheDocument();
    expect(screen.getByText('Feuerwehrmann')).toBeInTheDocument();
  });

  it('does not show vehicle select by default', () => {
    render(<CrewPersonCard {...defaultProps} />);
    expect(screen.queryByTestId('vehicle-select')).not.toBeInTheDocument();
  });

  it('shows vehicle select when showVehicleSelect is true', () => {
    render(<CrewPersonCard {...defaultProps} showVehicleSelect />);
    expect(screen.getByTestId('vehicle-select')).toBeInTheDocument();
  });

  it('calls onFunktionChange when function changes', () => {
    const onFunktionChange = vi.fn();
    render(
      <CrewPersonCard
        {...defaultProps}
        onFunktionChange={onFunktionChange}
      />,
    );
    // Open the select dropdown by clicking on it
    const funktionSelect = screen.getByTestId('funktion-select');
    // MUI Select: click the div to open, then the internal input
    fireEvent.mouseDown(funktionSelect.querySelector('[role="combobox"]')!);
    // Select a different option from the listbox
    const option = screen.getByRole('option', { name: 'Maschinist' });
    fireEvent.click(option);
    expect(onFunktionChange).toHaveBeenCalledWith('Maschinist');
  });

  it('calls onVehicleChange when vehicle changes', () => {
    const onVehicleChange = vi.fn();
    render(
      <CrewPersonCard
        {...defaultProps}
        showVehicleSelect
        onVehicleChange={onVehicleChange}
      />,
    );
    const vehicleSelect = screen.getByTestId('vehicle-select');
    fireEvent.mouseDown(vehicleSelect.querySelector('[role="combobox"]')!);
    const option = screen.getByRole('option', { name: 'KDTFA' });
    fireEvent.click(option);
    expect(onVehicleChange).toHaveBeenCalledWith('v1', 'KDTFA');
  });

  it('calls onVehicleChange with null when unassigned option selected', () => {
    const onVehicleChange = vi.fn();
    const assignedAssignment = {
      ...mockAssignment,
      vehicleId: 'v1',
      vehicleName: 'KDTFA',
    };
    render(
      <CrewPersonCard
        {...defaultProps}
        assignment={assignedAssignment}
        showVehicleSelect
        onVehicleChange={onVehicleChange}
      />,
    );
    const vehicleSelect = screen.getByTestId('vehicle-select');
    fireEvent.mouseDown(vehicleSelect.querySelector('[role="combobox"]')!);
    const option = screen.getByRole('option', {
      name: '-- Nicht zugeordnet --',
    });
    fireEvent.click(option);
    expect(onVehicleChange).toHaveBeenCalledWith(null, '');
  });
});
