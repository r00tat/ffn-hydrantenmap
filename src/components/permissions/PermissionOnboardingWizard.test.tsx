// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../../lib/permissions', () => ({
  AppPermissions: { requestPermission: vi.fn() },
}));

import PermissionOnboardingWizard from './PermissionOnboardingWizard';

describe('PermissionOnboardingWizard', () => {
  it('progresses through steps and calls onComplete after the last', () => {
    const onComplete = vi.fn();
    render(<PermissionOnboardingWizard onComplete={onComplete} />);
    expect(screen.getByText('Standort')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Später'));
    expect(screen.getByText('Bluetooth')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Später'));
    expect(screen.getByText('Mitteilungen')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Später'));
    expect(onComplete).toHaveBeenCalled();
  });
});
