// @vitest-environment jsdom
import { screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import {
  WASSERSTAND_DEFAULTS,
  wasserstandSignature,
} from '../../../common/terrain/wasserstand';
import { renderWithIntl } from '../../../test-utils/intlRender';
import type { Wasserstand } from '../../firebase/firestore';
import WasserstandRechner from './WasserstandRechner';

vi.mock('../../../common/terrain/terrainClient', () => ({
  terrainClient: () => ({
    sample: async () => [{ heightM: 115.8, level: 'detail' }],
    adria: async () => [0.41],
    flood: () => ({
      result: new Promise(() => undefined),
      abort: () => undefined,
    }),
  }),
}));

vi.mock('../../../hooks/useFirecallItemUpdate', () => ({
  default: () => async () => undefined,
}));

const szenario = (overrides: Partial<Wasserstand> = {}): Wasserstand =>
  ({
    id: 'w1',
    type: 'wasserstand',
    name: 'Wulka Nord',
    lat: 47.9483,
    lng: 16.8482,
    wasserBasisHoehe: 115.8,
    wasserZuschlag: 0.5,
    wasserBasisStufe: 'detail',
    ...overrides,
  }) as Wasserstand;

describe('WasserstandRechner', () => {
  it('zeigt Basishöhe, Wasserstand und den Rechenknopf', async () => {
    renderWithIntl(<WasserstandRechner item={szenario()} />);
    expect(
      await screen.findByText(/115\.80 m \(EVRF2000\)/)
    ).toBeInTheDocument();
    expect(screen.getByText(/116\.30/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Berechnen/ })).toBeEnabled();
  });

  it('nennt die Einheit am Umkreis und am Zuschlag', () => {
    renderWithIntl(<WasserstandRechner item={szenario()} />);
    const umkreis = screen.getByLabelText(
      'Umkreis der Berechnung in m'
    ) as HTMLInputElement;
    expect(umkreis.value).toBe(`${WASSERSTAND_DEFAULTS.radiusM}`);
    expect(screen.getByLabelText('Zuschlag in m')).toBeInTheDocument();
    // Das „m" steht als Endung im Feld, nicht nur in der Überschrift.
    expect(screen.getAllByText('m').length).toBeGreaterThanOrEqual(2);
  });

  it('ohne Basishöhe wird nicht gerechnet', () => {
    renderWithIntl(
      <WasserstandRechner item={szenario({ wasserBasisHoehe: undefined })} />
    );
    expect(screen.getByText(/keine Geländehöhe vor/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Berechnen/ })).toBeDisabled();
  });

  it('bietet die Basishöhe neu zu bestimmen, wenn sie aus der Übersicht kommt', () => {
    renderWithIntl(
      <WasserstandRechner item={szenario({ wasserBasisStufe: 'overview' })} />
    );
    expect(
      screen.getByRole('button', { name: /Basishöhe neu bestimmen/ })
    ).toBeInTheDocument();
  });

  it('weist ein veraltetes Ergebnis aus', () => {
    renderWithIntl(
      <WasserstandRechner
        item={szenario({
          wasserBaender: '{"baender":[]}',
          wasserStufe: 'detail',
          wasserGerechnetFuer: 'passt nicht',
          wasserFlaecheM2: 250000,
          wasserMaxTiefe: 1.2,
        })}
      />
    );
    // Zweimal: als Warnung im Rechner und als Kurzhinweis in der Legende.
    expect(screen.getAllByText(/Ergebnis veraltet/).length).toBeGreaterThan(0);
  });

  it('zeigt den Knopf zur Feinrechnung erst über der Schwelle', () => {
    const grob = szenario({
      wasserBaender: '{"baender":[]}',
      wasserStufe: 'overview',
      wasserFlaecheM2: 40_000_000,
      wasserMaxTiefe: 1.2,
    });
    renderWithIntl(
      <WasserstandRechner
        item={{
          ...grob,
          wasserGerechnetFuer: wasserstandSignature(grob, 'overview'),
        }}
      />
    );
    expect(
      screen.getByRole('button', { name: /Fein rechnen/ })
    ).toBeInTheDocument();
  });

  it('nennt Fläche, Tiefe und Rasterweite im Ergebnis', () => {
    const fertig = szenario({
      wasserBaender: '{"baender":[]}',
      wasserStufe: 'detail',
      wasserFlaecheM2: 250000,
      wasserMaxTiefe: 1.24,
      wasserAbbruch: 'budget',
      wasserKachelnFehlend: 2,
    });
    renderWithIntl(
      <WasserstandRechner
        item={{
          ...fertig,
          wasserGerechnetFuer: wasserstandSignature(fertig, 'detail'),
        }}
      />
    );
    // Fläche steht in der Ergebniszeile **und** in der Legende.
    expect(screen.getAllByText(/25\.0 ha/).length).toBeGreaterThan(0);
    expect(screen.getByText(/1\.24 m/)).toBeInTheDocument();
    expect(screen.getByText(/Rechenbudget abgeschnitten/)).toBeInTheDocument();
    expect(screen.getByText(/2 Kacheln konnten/)).toBeInTheDocument();
    expect(screen.getByText(/Abschätzung/)).toBeInTheDocument();
  });
});
