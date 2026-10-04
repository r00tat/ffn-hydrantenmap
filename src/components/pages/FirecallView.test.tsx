// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FIRECALL_SECTION_NAMES } from '../../common/appShellRoutes';

const mocks = vi.hoisted(() => ({ pathname: '/einsatz/AAAAAAAAAAAAAAAAAAAA' }));

vi.mock('next/navigation', () => ({ usePathname: () => mocks.pathname }));
vi.mock('next/dynamic', () => ({ default: () => () => null }));
vi.mock('../Map/DynamicMap', () => ({ default: () => null }));

import FirecallView, { type FirecallSectionRegistry } from './FirecallView';

const ID = 'AAAAAAAAAAAAAAAAAAAA';

const sections = Object.fromEntries(
  FIRECALL_SECTION_NAMES.map((name) => [name, () => <div>Abschnitt {name}</div>]),
) as unknown as FirecallSectionRegistry;
const Map = () => <div>Karte</div>;

beforeEach(() => {
  mocks.pathname = `/einsatz/${ID}`;
});

describe('FirecallView', () => {
  it('zeigt auf der Einsatzseite die Karte', () => {
    render(<FirecallView sections={sections} map={Map} />);
    expect(screen.getByText('Karte')).toBeInTheDocument();
  });

  it('zeigt den Abschnitt aus der Adresse und folgt einem Wechsel', () => {
    mocks.pathname = `/einsatz/${ID}/tagebuch`;
    const { rerender } = render(<FirecallView sections={sections} map={Map} />);
    expect(screen.getByText('Abschnitt tagebuch')).toBeInTheDocument();

    mocks.pathname = `/einsatz/${ID}/atemschutzueberwachung`;
    rerender(<FirecallView sections={sections} map={Map} />);
    expect(screen.getByText('Abschnitt atemschutzueberwachung')).toBeInTheDocument();
    expect(screen.queryByText('Abschnitt tagebuch')).not.toBeInTheDocument();
  });

  it('zeigt nichts für eine fremde Adresse', () => {
    mocks.pathname = `/einsatz/${ID}/kostenersatz`;
    const { container } = render(<FirecallView sections={sections} map={Map} />);
    expect(container).toBeEmptyDOMElement();
  });
});
