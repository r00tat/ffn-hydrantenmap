// @vitest-environment jsdom
import { fireEvent, screen } from '@testing-library/react';
import { renderWithIntl as render } from '../../test-utils/intlRender';
import { describe, expect, it, vi } from 'vitest';
import { CrewAssignment, Fzg } from '../firebase/firestore';
import VehicleCrewSection from './VehicleCrewSection';

const mockCrew: CrewAssignment[] = [
  { id: '1', recipientId: 'r1', name: 'Mustermann', vehicleId: 'v1', vehicleName: 'TLF', funktion: 'Gruppenkommandant' },
  { id: '2', recipientId: 'r2', name: 'Meier', vehicleId: 'v1', vehicleName: 'TLF', funktion: 'Feuerwehrmann' },
];

const mockVehicles: Fzg[] = [
  { id: 'j1', name: 'TLF Jois', fw: 'Jois', type: 'vehicle' } as Fzg,
  { id: 'v1', name: 'TLF', type: 'vehicle' } as Fzg,
  { id: 'v2', name: 'KLF', fw: 'Neusiedl am See', type: 'vehicle' } as Fzg,
  { id: 'r1', name: 'RTW', type: 'vehicle' } as Fzg,
];

// Die vorgefertigten Fahrzeuge der eigenen Wehr; der echte Hook öffnet ein
// Firestore-Abo.
vi.mock('../../hooks/useKostenersatzVehicles', () => ({
  useKostenersatzVehicles: () => ({
    vehicles: [{ id: 'tlf', name: 'TLF', rateId: '2.05', sortOrder: 1 }],
  }),
}));

vi.mock('../../hooks/useFirecall', () => ({
  useCrewForVehicle: () => mockCrew,
  useCrewAssignmentActions: () => ({
    assignVehicle: vi.fn(),
    updateFunktion: vi.fn(),
  }),
  useFirecallId: () => 'fc1',
  useFirecall: () => ({ fw: 'Neusiedl am See' }),
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

  // TLF ist vorgefertigt, KLF trägt die eigene Feuerwehr, RTW hat weder das
  // eine noch das andere und gilt deshalb als fremd.
  it('bietet zuerst die eigenen, dann die fremden Fahrzeuge nach Feuerwehr an', () => {
    render(<VehicleCrewSection vehicleId="v1" />);
    // Je Person Funktion und Fahrzeug; das zweite Auswahlfeld ist das Fahrzeug.
    fireEvent.mouseDown(screen.getAllByRole('combobox')[1]);
    const listbox = screen.getByRole('listbox');
    expect(
      Array.from(listbox.children).map((el) => el.textContent?.trim()),
    ).toEqual([
      'Verfügbar',
      'Neusiedl am See',
      'TLF',
      'KLF',
      'Jois',
      'TLF Jois',
      'Ohne Feuerwehr',
      'RTW',
    ]);
  });
});
