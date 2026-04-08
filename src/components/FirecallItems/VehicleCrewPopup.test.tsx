// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { CrewAssignment } from '../firebase/firestore';

let mockCrewForVehicle: CrewAssignment[] = [];

vi.mock('../../hooks/useFirecall', () => ({
  useCrewForVehicle: () => mockCrewForVehicle,
}));

vi.mock('../firebase/firebase', () => ({
  default: {},
  firestore: { type: 'mock-firestore' },
}));

import VehicleCrewPopup from './VehicleCrewPopup';

describe('VehicleCrewPopup', () => {
  it('renders crew with function abbreviation when not FM', () => {
    mockCrewForVehicle = [
      { id: '1', recipientId: 'r1', name: 'Mustermann', vehicleId: 'v1', vehicleName: 'TLF', funktion: 'Gruppenkommandant' },
      { id: '2', recipientId: 'r2', name: 'Meier', vehicleId: 'v1', vehicleName: 'TLF', funktion: 'Maschinist' },
    ];
    render(<VehicleCrewPopup vehicleId="v1" />);
    expect(screen.getByText(/Mustermann \(GK\)/)).toBeInTheDocument();
    expect(screen.getByText(/Meier \(MA\)/)).toBeInTheDocument();
  });

  it('renders crew without abbreviation for FM', () => {
    mockCrewForVehicle = [
      { id: '3', recipientId: 'r3', name: 'Huber', vehicleId: 'v1', vehicleName: 'TLF', funktion: 'Feuerwehrmann' },
    ];
    render(<VehicleCrewPopup vehicleId="v1" />);
    expect(screen.getByText('Huber')).toBeInTheDocument();
    expect(screen.queryByText(/FM/)).not.toBeInTheDocument();
  });

  it('renders nothing when no crew assigned', () => {
    mockCrewForVehicle = [];
    const { container } = render(<VehicleCrewPopup vehicleId="v1" />);
    expect(container.textContent).toBe('');
  });
});
