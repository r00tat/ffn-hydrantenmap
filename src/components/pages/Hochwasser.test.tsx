// @vitest-environment jsdom
import { screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { renderWithIntl } from '../../test-utils/intlRender';
import Hochwasser from './Hochwasser';

const szenarien = vi.hoisted(() => ({ value: [] as unknown[] }));
const firecall = vi.hoisted(() => ({ value: { id: 'fc1' } as unknown }));

vi.mock('../../hooks/useWasserstandSzenarien', () => ({
  default: () => szenarien.value,
}));
vi.mock('../../hooks/useFirecall', () => ({
  useFirecall: () => firecall.value,
  useFirecallId: () => 'fc1',
}));
vi.mock('../../hooks/useFirecallItemAdd', () => ({
  default: () => async () => undefined,
}));
// Die Seite hängt am Standort für die Kartenmitte des neuen Elements; ohne
// Provider würfe der Hook.
vi.mock('../providers/PositionProvider', () => ({
  usePositionContext: () => [
    { lat: 47.9483, lng: 16.8482 },
    true,
    undefined,
    () => undefined,
    false,
  ],
}));
vi.mock('../../common/terrain/terrainClient', () => ({
  terrainClient: () => ({
    sample: async () => [{ heightM: 115.8, level: 'detail' }],
  }),
}));
vi.mock('../Map/Wasserstand/WasserstandMap', () => ({
  default: () => <div data-testid="karte" />,
}));
vi.mock('../Map/Wasserstand/WasserstandRechner', () => ({
  default: () => <div data-testid="rechner" />,
}));

describe('Hochwasser', () => {
  it('verweist ohne Einsatz auf die Einsatzauswahl', () => {
    firecall.value = { id: 'unknown' };
    renderWithIntl(<Hochwasser />);
    expect(screen.getByRole('link', { name: /Einsätze/ })).toBeInTheDocument();
  });

  it('sagt es, wenn noch kein Szenario da ist', () => {
    firecall.value = { id: 'fc1' };
    szenarien.value = [];
    renderWithIntl(<Hochwasser />);
    expect(screen.getByText(/Noch keine Wasserausbreitung/)).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /Wasserausbreitung einzeichnen/ })
    ).toBeInTheDocument();
  });

  it('listet Szenarien und markiert veraltete', () => {
    firecall.value = { id: 'fc1' };
    szenarien.value = [
      {
        id: 'w1',
        type: 'wasserstand',
        name: 'Wulka Nord',
        lat: 47.9,
        lng: 16.8,
        wasserFlaecheM2: 250000,
        wasserStufe: 'detail',
        wasserBaender: '{"baender":[]}',
        wasserGerechnetFuer: 'passt nicht',
      },
    ];
    renderWithIntl(<Hochwasser />);
    expect(screen.getByText('Wulka Nord')).toBeInTheDocument();
    expect(screen.getByText(/Ergebnis veraltet/)).toBeInTheDocument();
    expect(screen.getByTestId('rechner')).toBeInTheDocument();
  });
});
