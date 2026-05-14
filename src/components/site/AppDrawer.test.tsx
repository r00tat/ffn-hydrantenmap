// @vitest-environment jsdom
import React from 'react';
import { NextIntlClientProvider } from 'next-intl';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import deMessages from '../../../messages/de.json';

const pathnameMock = vi.fn<() => string>(() => '/');
const firebaseLoginMock = vi.fn(() => ({ isAdmin: true, isSignedIn: true }));

vi.mock('next/navigation', () => ({
  usePathname: () => pathnameMock(),
}));
vi.mock('../../hooks/useFirebaseLogin', () => ({
  default: () => firebaseLoginMock(),
}));
vi.mock('../../hooks/useFirecall', () => ({
  useFirecallId: () => 'unknown',
}));
vi.mock('../bugReport/BugReportProvider', () => ({
  useBugReport: () => ({ open: vi.fn() }),
  default: ({ children }: { children: React.ReactNode }) => children,
}));

import AppDrawer from './AppDrawer';

function renderDrawer() {
  const setIsOpen = vi.fn();
  render(
    <NextIntlClientProvider locale="de" messages={deMessages}>
      <AppDrawer isOpen={true} setIsOpen={setIsOpen} />
    </NextIntlClientProvider>,
  );
  return { setIsOpen };
}

describe('AppDrawer submenus', () => {
  it('toggles a parent submenu on click without closing the drawer', async () => {
    pathnameMock.mockReturnValue('/');
    firebaseLoginMock.mockReturnValue({ isAdmin: true, isSignedIn: true });
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
    firebaseLoginMock.mockReturnValue({ isAdmin: true, isSignedIn: true });
    renderDrawer();
    expect(screen.getByText('GIS Daten-Pipeline')).toBeInTheDocument();
  });

  it('shows the Profil entry only when signed in', () => {
    pathnameMock.mockReturnValue('/');
    firebaseLoginMock.mockReturnValue({ isAdmin: false, isSignedIn: true });
    const { unmount } = render(
      <NextIntlClientProvider locale="de" messages={deMessages}>
        <AppDrawer isOpen={true} setIsOpen={vi.fn()} />
      </NextIntlClientProvider>,
    );
    expect(screen.getByText('Profil')).toBeInTheDocument();
    unmount();

    firebaseLoginMock.mockReturnValue({ isAdmin: false, isSignedIn: false });
    render(
      <NextIntlClientProvider locale="de" messages={deMessages}>
        <AppDrawer isOpen={true} setIsOpen={vi.fn()} />
      </NextIntlClientProvider>,
    );
    expect(screen.queryByText('Profil')).toBeNull();
  });
});
