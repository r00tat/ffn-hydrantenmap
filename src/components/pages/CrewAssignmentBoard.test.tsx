// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { CrewAssignment, Fzg } from '../firebase/firestore';
import { BlaulichtSmsAlarm } from '../../app/blaulicht-sms/actions';

const {
  mockSyncFromAlarm,
  mockAssignVehicle,
  mockUpdateFunktion,
  mockRemoveAssignment,
  mockUseMediaQuery,
} = vi.hoisted(() => ({
  mockSyncFromAlarm: vi.fn(),
  mockAssignVehicle: vi.fn(),
  mockUpdateFunktion: vi.fn(),
  mockRemoveAssignment: vi.fn(),
  mockUseMediaQuery: vi.fn(() => false),
}));

const mockAssignments: CrewAssignment[] = [
  {
    id: 'a1',
    recipientId: 'r1',
    name: 'Max Mustermann',
    vehicleId: null,
    vehicleName: '',
    funktion: 'Feuerwehrmann',
  },
  {
    id: 'a2',
    recipientId: 'r2',
    name: 'Anna Beispiel',
    vehicleId: 'v1',
    vehicleName: 'KDTFA',
    funktion: 'Maschinist',
  },
];

const mockVehicles: Fzg[] = [
  { id: 'v1', name: 'KDTFA', type: 'vehicle' },
  { id: 'v2', name: 'TLFA 4000', type: 'vehicle' },
] as Fzg[];

vi.mock('@dnd-kit/core', () => ({
  DndContext: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="dnd-context">{children}</div>
  ),
  DragOverlay: () => null,
  useDraggable: () => ({
    attributes: {},
    listeners: {},
    setNodeRef: vi.fn(),
    transform: null,
    isDragging: false,
  }),
  useDroppable: () => ({
    isOver: false,
    setNodeRef: vi.fn(),
  }),
  useSensor: vi.fn((_sensor: unknown, _options?: unknown) => ({})),
  useSensors: vi.fn((..._sensors: unknown[]) => []),
  MouseSensor: vi.fn(),
  TouchSensor: vi.fn(),
}));

vi.mock('../../hooks/useCrewAssignments', () => ({
  default: () => ({
    crewAssignments: mockAssignments,
    syncFromAlarm: mockSyncFromAlarm,
    assignVehicle: mockAssignVehicle,
    updateFunktion: mockUpdateFunktion,
    removeAssignment: mockRemoveAssignment,
  }),
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

vi.mock('@mui/material/useMediaQuery', () => ({
  default: mockUseMediaQuery,
}));

vi.mock('@mui/material', async () => {
  const actual =
    await vi.importActual<typeof import('@mui/material')>('@mui/material');
  return {
    ...actual,
    useMediaQuery: mockUseMediaQuery,
  };
});

import CrewAssignmentBoard from './CrewAssignmentBoard';

const mockAlarm: BlaulichtSmsAlarm = {
  productType: 'blaulichtsms',
  customerId: 'c1',
  customerName: 'FF Test',
  alarmId: 'alarm1',
  scenarioId: null,
  indexNumber: 1,
  alarmGroups: [],
  alarmDate: '2024-01-15T12:00:00Z',
  endDate: '',
  authorName: 'Test Author',
  alarmText: 'Brandalarm',
  audioUrl: null,
  needsAcknowledgement: true,
  usersAlertedCount: 10,
  geolocation: {
    coordinates: { lat: 47.8, lon: 16.8 },
    positionSetByAuthor: false,
    radius: null,
    distance: null,
    duration: null,
    address: null,
  },
  coordinates: null,
  recipients: [
    {
      id: 'r1',
      name: 'Max Mustermann',
      participation: 'yes',
      msisdn: '',
      comment: '',
      participationMessage: null,
      functions: [],
    },
    {
      id: 'r2',
      name: 'Anna Beispiel',
      participation: 'yes',
      msisdn: '',
      comment: '',
      participationMessage: null,
      functions: [],
    },
    {
      id: 'r3',
      name: 'Fritz Nein',
      participation: 'no',
      msisdn: '',
      comment: '',
      participationMessage: null,
      functions: [],
    },
  ],
};

describe('CrewAssignmentBoard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseMediaQuery.mockReturnValue(false);
  });

  it('renders Besatzung heading', () => {
    render(<CrewAssignmentBoard alarm={mockAlarm} />);
    expect(screen.getByText('Besatzung')).toBeInTheDocument();
  });

  it('calls syncFromAlarm on mount with alarm recipients', () => {
    render(<CrewAssignmentBoard alarm={mockAlarm} />);
    expect(mockSyncFromAlarm).toHaveBeenCalledWith(mockAlarm.recipients);
  });

  it('renders person names in table', () => {
    render(<CrewAssignmentBoard alarm={mockAlarm} />);
    expect(screen.getByText('Max Mustermann')).toBeInTheDocument();
    expect(screen.getByText('Anna Beispiel')).toBeInTheDocument();
  });

  it('renders vehicle section headers with counts', () => {
    render(<CrewAssignmentBoard alarm={mockAlarm} />);
    expect(screen.getByText(/Verfügbar \(1\)/)).toBeInTheDocument();
    expect(screen.getByText(/KDTFA \(1\)/)).toBeInTheDocument();
    expect(screen.getByText(/TLFA 4000 \(0\)/)).toBeInTheDocument();
  });

  it('renders table column headers', () => {
    render(<CrewAssignmentBoard alarm={mockAlarm} />);
    expect(screen.getByText('Name')).toBeInTheDocument();
    expect(screen.getByText('Funktion')).toBeInTheDocument();
    expect(screen.getByText('Fahrzeug')).toBeInTheDocument();
  });
});
