// @vitest-environment jsdom
import React from 'react';
import { NextIntlClientProvider } from 'next-intl';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import deMessages from '../../../messages/de.json';

const pathnameMock = vi.fn<() => string>(() => '/');
const firebaseLoginMock = vi.fn<
  () => {
    isAdmin: boolean;
    isSignedIn: boolean;
    fahrtenbuchGeraetemeister?: string[];
  }
>(() => ({ isAdmin: true, isSignedIn: true }));

vi.mock('next/navigation', () => ({
  usePathname: () => pathnameMock(),
}));
vi.mock('../../hooks/useFirebaseLogin', () => ({
  default: () => firebaseLoginMock(),
}));
const firecallIdMock = vi.fn<() => string>(() => 'unknown');
vi.mock('../../hooks/useFirecall', () => ({
  useFirecallId: () => firecallIdMock(),
}));
vi.mock('../bugReport/BugReportProvider', () => ({
  useBugReport: () => ({ open: vi.fn() }),
  default: ({ children }: { children: React.ReactNode }) => children,
}));

import AppDrawer from './AppDrawer';

function renderDrawer() {
  const setIsOpen = vi.fn();
  const view = render(
    <NextIntlClientProvider locale="de" messages={deMessages}>
      <AppDrawer isOpen={true} setIsOpen={setIsOpen} />
    </NextIntlClientProvider>,
  );
  const rerender = () =>
    view.rerender(
      <NextIntlClientProvider locale="de" messages={deMessages}>
        <AppDrawer isOpen={true} setIsOpen={setIsOpen} />
      </NextIntlClientProvider>,
    );
  return { setIsOpen, rerender, unmount: view.unmount };
}

/** Die Menüpunkte, die ohne Aufklappen erreichbar bleiben müssen. */
const DIREKT = ['Karte', 'Details', 'Einsätze'];

const GRUPPEN = [
  'Lageführung',
  'Einsatz-Dokumentation',
  'Fahrzeuge',
  'Werkzeuge',
  'Schadstoff',
  'Administration',
  'Hilfe & Konto',
];

describe('AppDrawer Gruppierung', () => {
  it('zeigt eingeklappt nur die direkten Punkte und die Gruppen', () => {
    pathnameMock.mockReturnValue('/');
    firecallIdMock.mockReturnValue('unknown');
    firebaseLoginMock.mockReturnValue({ isAdmin: true, isSignedIn: true });
    renderDrawer();

    for (const text of [...DIREKT, ...GRUPPEN]) {
      expect(screen.getByText(text)).toBeInTheDocument();
    }
    // Kinder sind eingeklappt, solange die Gruppe nicht die aktive Seite enthält.
    for (const text of ['Ebenen', 'Einsatz Tagebuch', 'Fahrtenbuch', 'Users']) {
      expect(screen.queryByText(text)).toBeNull();
    }
  });

  it('hält Karte und Details als Links ohne Aufklappen erreichbar', () => {
    pathnameMock.mockReturnValue('/einsaetze');
    firecallIdMock.mockReturnValue('unknown');
    renderDrawer();

    expect(screen.getByRole('link', { name: 'Karte' })).toHaveAttribute(
      'href',
      '/',
    );
    expect(screen.getByRole('link', { name: 'Details' })).toHaveAttribute(
      'href',
      '/',
    );
  });

  it('rendert Gruppenköpfe als Aufklapper und nicht als Link', () => {
    pathnameMock.mockReturnValue('/');
    renderDrawer();

    for (const gruppe of GRUPPEN) {
      expect(screen.queryByRole('link', { name: gruppe })).toBeNull();
    }
  });

  it('klappt eine Gruppe auf und zu, ohne das Menü zu schließen', async () => {
    pathnameMock.mockReturnValue('/');
    firebaseLoginMock.mockReturnValue({ isAdmin: true, isSignedIn: true });
    const user = userEvent.setup();
    const { setIsOpen } = renderDrawer();

    expect(screen.queryByText('Ebenen')).toBeNull();
    await user.click(screen.getByText('Lageführung'));
    expect(screen.getByText('Ebenen')).toBeInTheDocument();
    expect(screen.getByText('Löschwasserversorgung')).toBeInTheDocument();
    expect(setIsOpen).not.toHaveBeenCalled();

    await user.click(screen.getByText('Lageführung'));
    expect(screen.queryByText('Ebenen')).toBeNull();
  });

  it('öffnet die Gruppe der aktuellen Seite', () => {
    pathnameMock.mockReturnValue('/fahrtenbuch/maengel');
    firebaseLoginMock.mockReturnValue({ isAdmin: true, isSignedIn: true });
    renderDrawer();

    expect(screen.getByText('Mängel')).toBeInTheDocument();
    // Andere Gruppen bleiben zu.
    expect(screen.queryByText('Ebenen')).toBeNull();
  });

  it('setzt den Aufklapp-Zustand beim Seitenwechsel auf die neue Gruppe zurück', async () => {
    pathnameMock.mockReturnValue('/');
    const user = userEvent.setup();
    const { rerender } = renderDrawer();

    await user.click(screen.getByText('Werkzeuge'));
    expect(screen.getByText('Kennzeichenabfrage')).toBeInTheDocument();

    pathnameMock.mockReturnValue('/fahrtenbuch');
    rerender();

    expect(screen.getByText('Fahrtenbuch')).toBeInTheDocument();
    // Die zugeklappte Gruppe verschwindet erst nach der Collapse-Animation.
    await waitFor(() =>
      expect(screen.queryByText('Kennzeichenabfrage')).toBeNull(),
    );
  });
});

describe('AppDrawer aktive Seite', () => {
  it('markiert den längsten passenden Menüpunkt', () => {
    // /fahrtenbuch/maengel darf nicht zusätzlich das Fahrtenbuch markieren.
    pathnameMock.mockReturnValue('/fahrtenbuch/maengel');
    firecallIdMock.mockReturnValue('unknown');
    renderDrawer();

    expect(screen.getByText('Mängel').closest('[aria-current="page"]')).not.toBeNull();
    expect(
      screen.getByText('Fahrtenbuch').closest('[aria-current="page"]'),
    ).toBeNull();
  });

  it('markiert die Karte nur auf der Karten-Seite', () => {
    pathnameMock.mockReturnValue('/');
    renderDrawer();
    expect(screen.getByText('Karte').closest('[aria-current="page"]')).not.toBeNull();
    expect(screen.getByText('Details').closest('[aria-current="page"]')).toBeNull();
  });

  it('markiert den Gruppenkopf, wenn die Gruppe der aktiven Seite zugeklappt wird', async () => {
    pathnameMock.mockReturnValue('/fahrtenbuch/maengel');
    const user = userEvent.setup();
    renderDrawer();

    // Aufgeklappt trägt das Kind die Markierung, nicht der Kopf.
    expect(
      screen.getByText('Fahrzeuge').closest('[aria-current]'),
    ).toBeNull();

    await user.click(screen.getByText('Fahrzeuge'));
    expect(
      screen.getByText('Fahrzeuge').closest('[aria-current="true"]'),
    ).not.toBeNull();
  });

  it('markiert einsatzbezogene Punkte auf der Einsatz-URL', () => {
    pathnameMock.mockReturnValue('/einsatz/f1/tagebuch');
    firecallIdMock.mockReturnValue('f1');
    renderDrawer();

    expect(
      screen.getByText('Einsatz Tagebuch').closest('[aria-current="page"]'),
    ).not.toBeNull();
    expect(screen.getByText('Karte').closest('[aria-current="page"]')).toBeNull();
  });
});

describe('AppDrawer Berechtigungen', () => {
  it('zeigt Nicht-Admins in der Administration nur die Tokens', async () => {
    pathnameMock.mockReturnValue('/');
    firebaseLoginMock.mockReturnValue({ isAdmin: false, isSignedIn: true });
    const user = userEvent.setup();
    renderDrawer();

    await user.click(screen.getByText('Administration'));
    expect(screen.getByText('Tokens')).toBeInTheDocument();
    expect(screen.queryByText('Users')).toBeNull();
    expect(screen.queryByText('Audit Log')).toBeNull();
  });

  it('zeigt die Fahrtenbuch-Verwaltung auch einem Gerätemeister ohne Adminrecht', async () => {
    pathnameMock.mockReturnValue('/');
    firebaseLoginMock.mockReturnValue({
      isAdmin: false,
      isSignedIn: true,
      fahrtenbuchGeraetemeister: ['ffnd'],
    });
    const user = userEvent.setup();
    renderDrawer();

    await user.click(screen.getByText('Administration'));
    expect(screen.getByText('Fahrtenbuch-Verwaltung')).toBeInTheDocument();
    expect(screen.queryByText('Users')).toBeNull();
  });

  it('verbirgt die Fahrtenbuch-Verwaltung ohne jede Rolle', async () => {
    pathnameMock.mockReturnValue('/');
    firebaseLoginMock.mockReturnValue({ isAdmin: false, isSignedIn: true });
    const user = userEvent.setup();
    renderDrawer();

    await user.click(screen.getByText('Administration'));
    expect(screen.queryByText('Fahrtenbuch-Verwaltung')).toBeNull();
  });

  it('zeigt den Profil-Eintrag nur angemeldet', async () => {
    pathnameMock.mockReturnValue('/');
    firebaseLoginMock.mockReturnValue({ isAdmin: false, isSignedIn: true });
    const user = userEvent.setup();
    const { unmount } = renderDrawer();

    await user.click(screen.getByText('Hilfe & Konto'));
    expect(screen.getByText('Profil')).toBeInTheDocument();
    unmount();

    firebaseLoginMock.mockReturnValue({ isAdmin: false, isSignedIn: false });
    renderDrawer();
    await user.click(screen.getByText('Hilfe & Konto'));
    expect(screen.queryByText('Profil')).toBeNull();
  });
});

describe('AppDrawer Einsatz-Links', () => {
  it('führt das Fahrtenbuch auch bei laufendem Einsatz auf /fahrtenbuch', async () => {
    // Das Fahrtenbuch wird auch ohne Einsatz geführt. Zeigte der Menüpunkt auf
    // die Einsatz-Sammelerfassung, gäbe es keinen Weg zur Fahrzeugübersicht.
    pathnameMock.mockReturnValue('/');
    firecallIdMock.mockReturnValue('f1');
    firebaseLoginMock.mockReturnValue({ isAdmin: true, isSignedIn: true });
    const user = userEvent.setup();
    renderDrawer();

    await user.click(screen.getByText('Fahrzeuge'));
    expect(screen.getByRole('link', { name: 'Fahrtenbuch' })).toHaveAttribute(
      'href',
      '/fahrtenbuch',
    );

    // Zum Vergleich ein Menüpunkt, der bewusst in den Einsatz führt.
    await user.click(screen.getByText('Einsatz-Dokumentation'));
    expect(
      screen.getByRole('link', { name: 'Einsatz Tagebuch' }),
    ).toHaveAttribute('href', '/einsatz/f1/tagebuch');
  });
});
