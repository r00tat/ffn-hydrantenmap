// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { renderWithIntl as render } from '../../test-utils/intlRender';
import { CrewAssignment, Fzg } from '../firebase/firestore';
import { BlaulichtSmsAlarm } from '../../app/blaulicht-sms/actions';

const {
  mockSyncFromAlarms,
  mockAddManualPerson,
  mockAddPersonFromRecipient,
  mockAssignVehicle,
  mockUpdateFunktion,
  mockRemoveAssignment,
  mockUseMediaQuery,
} = vi.hoisted(() => ({
  mockSyncFromAlarms: vi.fn(),
  mockAddManualPerson: vi.fn(),
  mockAddPersonFromRecipient: vi.fn(),
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
    source: 'alarm',
  },
  {
    id: 'a2',
    recipientId: 'r2',
    name: 'Anna Beispiel',
    vehicleId: 'v1',
    vehicleName: 'KDTFA',
    funktion: 'Maschinist',
    source: 'alarm',
  },
  {
    id: 'a3',
    recipientId: 'r3',
    name: 'Fritz Nein',
    vehicleId: null,
    vehicleName: '',
    funktion: 'Feuerwehrmann',
    source: 'manual',
  },
  // Legacy manual entry created before the `source` field existed.
  {
    id: 'a4',
    recipientId: 'manual-1699000000000',
    name: 'Legacy Walkin',
    vehicleId: null,
    vehicleName: '',
    funktion: 'Feuerwehrmann',
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
    syncFromAlarms: mockSyncFromAlarms,
    addManualPerson: mockAddManualPerson,
    addPersonFromRecipient: mockAddPersonFromRecipient,
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

// Der Board-Code fragt das Schreibrecht ab; der echte Hook zieht die
// Firebase-Login-Kette (und damit server-only Module) in den Test.
vi.mock('../../hooks/useFirecallWriteAccess', () => ({
  default: () => true,
}));

vi.mock('../../hooks/useFirecallItemAdd', () => ({
  default: () => vi.fn(),
}));

vi.mock('../../hooks/useFirecall', () => ({
  useFirecall: () => ({ lat: 47.8, lng: 16.8 }),
  useFirecallId: () => 'test-firecall-id',
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
    {
      id: 'r4',
      name: 'Nina Ausstehend',
      participation: 'pending',
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
    render(<CrewAssignmentBoard alarms={[mockAlarm]} />);
    expect(screen.getByText('Besatzung')).toBeInTheDocument();
  });

  it('calls syncFromAlarms on mount with the alarm list', () => {
    render(<CrewAssignmentBoard alarms={[mockAlarm]} />);
    expect(mockSyncFromAlarms).toHaveBeenCalledWith([mockAlarm]);
  });

  it('renders confirmed person names in table', () => {
    render(<CrewAssignmentBoard alarms={[mockAlarm]} />);
    expect(screen.getByText('Max Mustermann')).toBeInTheDocument();
    expect(screen.getByText('Anna Beispiel')).toBeInTheDocument();
  });

  it('keeps a manually added declined person visible', () => {
    render(<CrewAssignmentBoard alarms={[mockAlarm]} />);
    expect(screen.getByText('Fritz Nein')).toBeInTheDocument();
  });

  it('keeps a legacy manual entry (no source) visible with an alarm loaded', () => {
    render(<CrewAssignmentBoard alarms={[mockAlarm]} />);
    expect(screen.getByText('Legacy Walkin')).toBeInTheDocument();
  });

  it('hides an alarm-source person who is no longer confirmed', () => {
    const withdrawn: BlaulichtSmsAlarm = {
      ...mockAlarm,
      recipients: mockAlarm.recipients.map((r) =>
        r.id === 'r2' ? { ...r, participation: 'no' as const } : r,
      ),
    };
    render(<CrewAssignmentBoard alarms={[withdrawn]} />);
    expect(screen.queryByText('Anna Beispiel')).not.toBeInTheDocument();
    expect(screen.getByText('Max Mustermann')).toBeInTheDocument();
    expect(screen.getByText('Fritz Nein')).toBeInTheDocument();
  });

  it('renders Kanban columns on desktop with vehicle names', () => {
    mockUseMediaQuery.mockReturnValue(false);
    render(<CrewAssignmentBoard alarms={[mockAlarm]} />);
    expect(screen.getByText('Verfügbar')).toBeInTheDocument();
    expect(screen.getAllByText('KDTFA').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('TLFA 4000').length).toBeGreaterThanOrEqual(1);
  });

  it('renders table with headers on mobile', () => {
    mockUseMediaQuery.mockReturnValue(true);
    render(<CrewAssignmentBoard alarms={[mockAlarm]} />);
    expect(screen.getByText('Name')).toBeInTheDocument();
    expect(screen.getByText('Funktion')).toBeInTheDocument();
    expect(screen.getByText('Fahrzeug')).toBeInTheDocument();
  });

  it('offers non-yes, not-yet-added recipients as autocomplete options', async () => {
    const userEvent = (await import('@testing-library/user-event')).default;
    const user = userEvent.setup();
    render(<CrewAssignmentBoard alarms={[mockAlarm]} />);
    const input = screen.getByLabelText('Weitere Person hinzufügen');
    await user.click(input);
    // Nina (r4, pending) is non-yes and not already in the crew list → an option,
    // rendered with its status label. Fritz (r3) is already added → NOT an option.
    expect(screen.getByText(/Nina Ausstehend \(ausstehend\)/)).toBeInTheDocument();
    // yes-recipients and already-added recipients are NOT offered as options
    // (Max/Anna confirmed; Fritz already in the crew list). They appear at most
    // as crew rows, never as a status-labelled option.
    expect(screen.queryByText(/Max Mustermann \(/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Fritz Nein \(/)).not.toBeInTheDocument();
  });
});
