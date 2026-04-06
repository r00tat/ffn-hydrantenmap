// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

vi.mock('../../common/defaultKostenersatzRates', () => ({
  DEFAULT_VEHICLES: [
    { name: 'KDTFA', rateId: '2.01', description: 'Kommando', sortOrder: 1 },
    { name: 'TLFA 4000', rateId: '2.05', description: 'Tank1', sortOrder: 3 },
    { name: 'SRF', rateId: '2.10', description: 'Rüst', sortOrder: 5 },
  ],
}));

import VehicleQuickAddChips from './VehicleQuickAddChips';

describe('VehicleQuickAddChips', () => {
  const defaultProps = {
    selectedNames: [] as string[],
    existingNames: [] as string[],
    onToggle: vi.fn(),
  };

  it('renders all default vehicles as chips', () => {
    render(<VehicleQuickAddChips {...defaultProps} />);
    expect(screen.getByText('KDTFA')).toBeInTheDocument();
    expect(screen.getByText('TLFA 4000')).toBeInTheDocument();
    expect(screen.getByText('SRF')).toBeInTheDocument();
  });

  it('calls onToggle when a chip is clicked', () => {
    const onToggle = vi.fn();
    render(<VehicleQuickAddChips {...defaultProps} onToggle={onToggle} />);
    fireEvent.click(screen.getByText('KDTFA'));
    expect(onToggle).toHaveBeenCalledWith('KDTFA');
  });

  it('shows selected chips as filled primary', () => {
    render(
      <VehicleQuickAddChips {...defaultProps} selectedNames={['KDTFA']} />,
    );
    const chip = screen.getByText('KDTFA').closest('.MuiChip-root');
    expect(chip).toHaveClass('MuiChip-filled');
    expect(chip).toHaveClass('MuiChip-colorPrimary');
  });

  it('shows unselected chips as outlined', () => {
    render(<VehicleQuickAddChips {...defaultProps} />);
    const chip = screen.getByText('KDTFA').closest('.MuiChip-root');
    expect(chip).toHaveClass('MuiChip-outlined');
  });

  it('disables chips for already existing vehicles', () => {
    render(
      <VehicleQuickAddChips {...defaultProps} existingNames={['KDTFA']} />,
    );
    const chip = screen.getByText('KDTFA').closest('.MuiChip-root');
    expect(chip).toHaveClass('Mui-disabled');
  });

  it('shows existing vehicles as filled primary (already added)', () => {
    render(
      <VehicleQuickAddChips {...defaultProps} existingNames={['KDTFA']} />,
    );
    const chip = screen.getByText('KDTFA').closest('.MuiChip-root');
    expect(chip).toHaveClass('MuiChip-filled');
    expect(chip).toHaveClass('MuiChip-colorPrimary');
  });

  it('shows selected count badge', () => {
    render(
      <VehicleQuickAddChips {...defaultProps} selectedNames={['KDTFA', 'SRF']} />,
    );
    expect(screen.getByText('2')).toBeInTheDocument();
  });

  it('does not show count badge when nothing is selected', () => {
    render(<VehicleQuickAddChips {...defaultProps} />);
    expect(screen.queryByText('0')).not.toBeInTheDocument();
  });
});
