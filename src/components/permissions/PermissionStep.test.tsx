// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../../lib/permissions', () => ({
  AppPermissions: {
    requestPermission: vi.fn(),
  },
}));

import { AppPermissions } from '../../lib/permissions';
import PermissionStep from './PermissionStep';

describe('PermissionStep', () => {
  it('calls onResult("skipped") when "Später" clicked', () => {
    const onResult = vi.fn();
    render(
      <PermissionStep
        type="location"
        icon={null}
        title="Standort"
        description="d"
        onResult={onResult}
      />
    );
    fireEvent.click(screen.getByText('Später'));
    expect(onResult).toHaveBeenCalledWith('skipped');
  });

  it('calls request and resolves with granted/denied', async () => {
    const onResult = vi.fn();
    (AppPermissions.requestPermission as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({ state: 'granted' });
    render(
      <PermissionStep
        type="bluetooth"
        icon={null}
        title="BT"
        description="d"
        onResult={onResult}
      />
    );
    fireEvent.click(screen.getByText('Erlauben'));
    await vi.waitFor(() => expect(onResult).toHaveBeenCalledWith('granted'));
  });
});
