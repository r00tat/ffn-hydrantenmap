// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { renderWithIntl as render } from '../../test-utils/intlRender';
import { CrewAssignment, Fzg } from '../firebase/firestore';

vi.mock('@dnd-kit/core', () => ({
  useDraggable: () => ({
    attributes: {},
    listeners: {},
    setNodeRef: vi.fn(),
    transform: null,
  }),
  useDroppable: () => ({
    isOver: false,
    setNodeRef: (el: HTMLElement | null) => {
      if (el) el.dataset.testid = 'droppable';
    },
  }),
}));

import CrewVehicleColumn, {
  CrewVehicleColumnProps,
} from './CrewVehicleColumn';

const mockVehicles: Fzg[] = [
  { id: 'v1', name: 'KDTFA', type: 'vehicle' },
  { id: 'v2', name: 'TLFA 4000', type: 'vehicle' },
] as Fzg[];

const mockAssignments: CrewAssignment[] = [
  {
    id: 'a1',
    recipientId: 'r1',
    name: 'Max Mustermann',
    vehicleId: 'v1',
    vehicleName: 'KDTFA',
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

describe('CrewVehicleColumn', () => {
  let defaultProps: CrewVehicleColumnProps;

  beforeEach(() => {
    defaultProps = {
      vehicleId: 'v1',
      vehicleName: 'KDTFA',
      assignments: mockAssignments,
      vehicles: mockVehicles,
      onFunktionChange: vi.fn(),
      onVehicleChange: vi.fn(),
    };
  });

  it('renders vehicle name as header', () => {
    render(<CrewVehicleColumn {...defaultProps} />);
    expect(screen.getByText('KDTFA')).toBeInTheDocument();
  });

  it('renders crew count', () => {
    render(<CrewVehicleColumn {...defaultProps} />);
    expect(screen.getByText('2')).toBeInTheDocument();
  });

  it('renders CrewPersonCards for each assignment', () => {
    render(<CrewVehicleColumn {...defaultProps} />);
    expect(screen.getByText('Max Mustermann')).toBeInTheDocument();
    expect(screen.getByText('Anna Beispiel')).toBeInTheDocument();
  });

  it('has drop target element', () => {
    const { container } = render(<CrewVehicleColumn {...defaultProps} />);
    const droppable = container.querySelector('[data-testid="droppable"]');
    expect(droppable).toBeInTheDocument();
  });

  it('renders Verfügbar column when vehicleId is null', () => {
    render(
      <CrewVehicleColumn
        {...defaultProps}
        vehicleId={null}
        vehicleName="Verfügbar"
        assignments={[]}
      />,
    );
    expect(screen.getByText('Verfügbar')).toBeInTheDocument();
    expect(screen.getByText('0')).toBeInTheDocument();
  });

  describe('vehicle removal', () => {
    it('renders no remove button without onRemoveVehicle', () => {
      render(<CrewVehicleColumn {...defaultProps} />);
      expect(
        screen.queryByLabelText('KDTFA aus dem Einsatz entfernen'),
      ).not.toBeInTheDocument();
    });

    it('calls onRemoveVehicle with the vehicle id', () => {
      const onRemoveVehicle = vi.fn();
      render(
        <CrewVehicleColumn
          {...defaultProps}
          onRemoveVehicle={onRemoveVehicle}
        />,
      );
      fireEvent.click(
        screen.getByLabelText('KDTFA aus dem Einsatz entfernen'),
      );
      expect(onRemoveVehicle).toHaveBeenCalledWith('v1');
    });

    it('renders no remove button for the unassigned column', () => {
      render(
        <CrewVehicleColumn
          {...defaultProps}
          vehicleId={null}
          vehicleName="Verfügbar"
          assignments={[]}
          onRemoveVehicle={vi.fn()}
        />,
      );
      expect(
        screen.queryByLabelText('Verfügbar aus dem Einsatz entfernen'),
      ).not.toBeInTheDocument();
    });

    it('renders no remove button in read-only mode', () => {
      render(
        <CrewVehicleColumn
          {...defaultProps}
          onRemoveVehicle={vi.fn()}
          readOnly
        />,
      );
      expect(
        screen.queryByLabelText('KDTFA aus dem Einsatz entfernen'),
      ).not.toBeInTheDocument();
    });
  });
});
