// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { CrewAssignment, Fzg } from '../firebase/firestore';
import VehicleCrewSection from './VehicleCrewSection';

const mockCrew: CrewAssignment[] = [
  { id: '1', recipientId: 'r1', name: 'Mustermann', vehicleId: 'v1', vehicleName: 'TLF', funktion: 'Gruppenkommandant' },
  { id: '2', recipientId: 'r2', name: 'Meier', vehicleId: 'v1', vehicleName: 'TLF', funktion: 'Feuerwehrmann' },
];

const mockVehicles: Fzg[] = [
  { id: 'v1', name: 'TLF', type: 'vehicle' } as Fzg,
  { id: 'v2', name: 'KLF', type: 'vehicle' } as Fzg,
];

vi.mock('../../hooks/useFirecall', () => ({
  useCrewForVehicle: () => mockCrew,
  useCrewAssignmentActions: () => ({
    assignVehicle: vi.fn(),
    updateFunktion: vi.fn(),
  }),
  useFirecallId: () => 'fc1',
}));

vi.mock('../../hooks/useVehicles', () => ({
  default: () => ({
    vehicles: mockVehicles,
    tacticalUnits: [],
    rohre: [],
    otherItems: [],
    displayItems: [],
    firecallItems: [],
  }),
}));

describe('VehicleCrewSection', () => {
  it('renders crew members with their names', () => {
    render(<VehicleCrewSection vehicleId="v1" />);
    expect(screen.getByText('Mustermann')).toBeInTheDocument();
    expect(screen.getByText('Meier')).toBeInTheDocument();
  });

  it('shows Besatzung heading', () => {
    render(<VehicleCrewSection vehicleId="v1" />);
    expect(screen.getByText(/Besatzung/)).toBeInTheDocument();
  });

  it('renders nothing when no vehicle id', () => {
    const { container } = render(<VehicleCrewSection vehicleId="" />);
    expect(container.textContent).toBe('');
  });
});
