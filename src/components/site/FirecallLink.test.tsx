// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ pathname: '/einsatz/AAAAAAAAAAAAAAAAAAAA' }));

vi.mock('next/navigation', () => ({ usePathname: () => mocks.pathname }));
vi.mock('next/link', () => ({
  // Wie next/link: Ein `preventDefault` im eigenen onClick verhindert die
  // Navigation des Routers.
  default: ({
    href,
    onClick,
    children,
    ...rest
  }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => (
    <a
      href={href}
      {...rest}
      onClick={(event) => {
        onClick?.(event);
        if (!event.defaultPrevented) {
          event.preventDefault();
          routerNavigate(href);
        }
      }}
    >
      {children}
    </a>
  ),
}));

const routerNavigate = vi.fn();

import FirecallLink from './FirecallLink';

const ID = 'AAAAAAAAAAAAAAAAAAAA';

beforeEach(() => {
  mocks.pathname = `/einsatz/${ID}`;
  routerNavigate.mockReset();
  vi.spyOn(window.history, 'pushState');
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('FirecallLink', () => {
  it('wechselt den Abschnitt desselben Einsatzes ohne Router (kein Serverabruf)', () => {
    render(<FirecallLink href={`/einsatz/${ID}/atemschutzueberwachung`}>Überwachung</FirecallLink>);
    fireEvent.click(screen.getByText('Überwachung'));
    expect(window.history.pushState).toHaveBeenCalledWith(
      null,
      '',
      `/einsatz/${ID}/atemschutzueberwachung`,
    );
    expect(window.scrollTo).toHaveBeenCalledWith(0, 0);
    expect(routerNavigate).not.toHaveBeenCalled();
  });

  it('ruft den eigenen onClick weiterhin auf', () => {
    const onClick = vi.fn();
    render(
      <FirecallLink href={`/einsatz/${ID}/tagebuch`} onClick={onClick}>
        Tagebuch
      </FirecallLink>,
    );
    fireEvent.click(screen.getByText('Tagebuch'));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('überlässt andere Ziele dem Router', () => {
    render(<FirecallLink href="/einsaetze">Einsätze</FirecallLink>);
    fireEvent.click(screen.getByText('Einsätze'));
    expect(window.history.pushState).not.toHaveBeenCalled();
    expect(routerNavigate).toHaveBeenCalledWith('/einsaetze');
  });

  it('lässt Klicks mit Strg/Cmd (neuer Tab) dem Browser', () => {
    render(<FirecallLink href={`/einsatz/${ID}/tagebuch`}>Tagebuch</FirecallLink>);
    fireEvent.click(screen.getByText('Tagebuch'), { ctrlKey: true });
    fireEvent.click(screen.getByText('Tagebuch'), { metaKey: true });
    expect(window.history.pushState).not.toHaveBeenCalled();
  });
});
