// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const pathnameMock = vi.fn<() => string>(() => '/');

vi.mock('next/navigation', () => ({
  usePathname: () => pathnameMock(),
}));
vi.mock('../../hooks/useFirebaseLogin', () => ({
  default: () => ({ isAdmin: true }),
}));
vi.mock('../../hooks/useFirecall', () => ({
  useFirecallId: () => 'unknown',
}));

import AppDrawer from './AppDrawer';

function renderDrawer() {
  const setIsOpen = vi.fn();
  render(<AppDrawer isOpen={true} setIsOpen={setIsOpen} />);
  return { setIsOpen };
}

describe('AppDrawer submenus', () => {
  it('toggles a parent submenu on click without closing the drawer', async () => {
    pathnameMock.mockReturnValue('/');
    const user = userEvent.setup();
    const { setIsOpen } = renderDrawer();

    expect(screen.queryByText('Admin Actions')).toBeNull();
    await user.click(screen.getByText('Admin'));
    expect(screen.getByText('Admin Actions')).toBeInTheDocument();
    expect(setIsOpen).not.toHaveBeenCalled();

    await user.click(screen.getByText('Admin'));
    expect(screen.queryByText('Admin Actions')).toBeNull();
  });

  it('auto-expands parent whose href prefixes the current pathname', () => {
    pathnameMock.mockReturnValue('/admin/gis-data');
    renderDrawer();
    expect(screen.getByText('GIS Data Pipeline')).toBeInTheDocument();
  });
});
