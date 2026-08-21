// @vitest-environment jsdom
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { LatLngPosition } from '../../../common/geo';
import type { Connection } from '../../firebase/firestore';
import { renderWithIntl } from '../../../test-utils/intlRender';

const addItem = vi.fn((_item: unknown) => Promise.resolve({ id: 'neu' }));
vi.mock('../../../hooks/useFirecallItemAdd', () => ({
  default: () => addItem,
}));

const updateItem = vi.fn((_item: unknown) => Promise.resolve());
vi.mock('../../../hooks/useFirecallItemUpdate', () => ({
  default: () => updateItem,
}));

import { elevationSignature, foerderungSamples } from '../../FirecallItems/elements/connection/foerderung/elevationProfile';
import LoeschwasserfoerderungDialog from './LoeschwasserfoerderungDialog';

const entnahme: LatLngPosition = [47.9482, 16.8482];
/** Rund 2000 m nach Norden — lang genug für mehrere Verstärkerpumpen. */
const verteiler: LatLngPosition = [47.9482 + 2000 / 111_320, 16.8482];

const connection = (overrides: Partial<Connection> = {}): Connection =>
  ({
    id: 'leitung-1',
    type: 'connection',
    name: 'Zubringleitung',
    lat: entnahme[0],
    lng: entnahme[1],
    destLat: verteiler[0],
    destLng: verteiler[1],
    positions: JSON.stringify([entnahme, verteiler]),
    dimension: 'B',
    oneHozeLength: 20,
    foerderung: 'true',
    ...overrides,
  }) as Connection;

/** Dieselbe Leitung mit flachem, zur Lage passendem Höhenprofil. */
const withProfile = (overrides: Partial<Connection> = {}): Connection => {
  const base = connection(overrides);
  const samples = foerderungSamples(base);
  return {
    ...base,
    elevationProfile: JSON.stringify(samples.map(() => 130)),
    elevationFor: elevationSignature(samples),
  } as Connection;
};

const pumpCount = () =>
  Number(
    /(\d+)/.exec(
      screen.getByText(/Verstärkerpumpen?$/).textContent ?? ''
    )?.[1] ?? 0
  );

describe('LoeschwasserfoerderungDialog', () => {
  beforeEach(() => {
    addItem.mockClear();
    updateItem.mockClear();
  });

  it('zeigt Lage und Ergebnis aus dem gespeicherten Profil', () => {
    renderWithIntl(
      <LoeschwasserfoerderungDialog
        item={withProfile()}
        open
        onClose={() => {}}
      />
    );

    // Die Länge steht unter ihrer Beschriftung; die Abschnittstabelle nennt
    // dieselbe Zahl noch einmal, deshalb gezielt am Label entlang gesucht.
    // Sie kommt aus der Leaflet-Messung und ist rund 2000 m, nicht exakt.
    expect(
      screen.getByText('Länge der Leitung').nextElementSibling
    ).toHaveTextContent(/^(19|20)\d\d m$/);
    expect(screen.getByText(/EU-DEM 25 m/)).toBeInTheDocument();
    expect(pumpCount()).toBeGreaterThan(0);
  });

  it('rechnet die Pumpenzahl bei einer neuen Fördermenge neu', async () => {
    const user = userEvent.setup();
    renderWithIntl(
      <LoeschwasserfoerderungDialog
        item={withProfile({ foerderMenge: 400 })}
        open
        onClose={() => {}}
      />
    );

    const before = pumpCount();
    const flowField = screen.getByRole('spinbutton', { name: /Fördermenge/ });
    await user.clear(flowField);
    await user.type(flowField, '1600');

    await waitFor(() => expect(pumpCount()).toBeGreaterThan(before));
  });

  it('warnt ohne Höhendaten und gibt das Höhenfeld frei', () => {
    renderWithIntl(
      <LoeschwasserfoerderungDialog
        item={connection()}
        open
        onClose={() => {}}
      />
    );

    expect(screen.getByText(/Keine Höhendaten verfügbar/)).toBeInTheDocument();
    expect(
      screen.getByRole('spinbutton', { name: /Höhenunterschied/ })
    ).toBeEnabled();
  });

  it('sperrt das Höhenfeld, solange ein Profil vorliegt', () => {
    renderWithIntl(
      <LoeschwasserfoerderungDialog
        item={withProfile()}
        open
        onClose={() => {}}
      />
    );

    expect(
      screen.getByRole('spinbutton', { name: /Höhenunterschied/ })
    ).toBeDisabled();
  });

  it('nennt den Grund, wenn die Dimension keinen Reibungswert hat', () => {
    renderWithIntl(
      <LoeschwasserfoerderungDialog
        item={withProfile({ dimension: 'Storz' })}
        open
        onClose={() => {}}
      />
    );

    expect(
      screen.getByText(/kein Reibungsverlust bekannt/)
    ).toBeInTheDocument();
    expect(screen.queryByText(/Verstärkerpumpen?$/)).not.toBeInTheDocument();
  });

  it('legt je Pumpe einen Marker und genau einen Tagebucheintrag ab', async () => {
    const user = userEvent.setup();
    const item = withProfile();
    renderWithIntl(
      <LoeschwasserfoerderungDialog item={item} open onClose={() => {}} />
    );

    const pumps = pumpCount() + 1; // plus die Pumpe an der Entnahmestelle
    await user.click(screen.getByRole('button', { name: /Pumpen als Marker/ }));

    await waitFor(() => expect(addItem).toHaveBeenCalledTimes(pumps + 1));

    const types = addItem.mock.calls.map((call) => (call[0] as any).type);
    expect(types.filter((type) => type === 'marker')).toHaveLength(pumps);
    expect(types.filter((type) => type === 'diary')).toHaveLength(1);

    // Die Pumpe an der Entnahmestelle wird als solche benannt, nicht als
    // Verstärkerpumpe.
    const names = addItem.mock.calls.map((call) => (call[0] as any).name);
    expect(names).toContain('Pumpe an der Entnahmestelle');
    expect(names).toContain('Verstärkerpumpe 1');

    // Und die Parameter werden mit gespeichert.
    expect(updateItem).toHaveBeenCalledWith(
      expect.objectContaining({ foerderung: 'true' })
    );
  });

  it('speichert die Parameter beim Übernehmen und schließt', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    renderWithIntl(
      <LoeschwasserfoerderungDialog
        item={withProfile()}
        open
        onClose={onClose}
      />
    );

    await user.click(screen.getByRole('button', { name: 'Übernehmen' }));

    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(updateItem).toHaveBeenCalledWith(
      expect.objectContaining({
        foerderung: 'true',
        foerderMenge: 1000,
        zielDruck: 6,
        pumpenAusgangsdruck: 8,
      })
    );
  });

  it('rechnet nicht, solange der Rechner abgeschaltet ist', async () => {
    const user = userEvent.setup();
    renderWithIntl(
      <LoeschwasserfoerderungDialog
        item={withProfile({ foerderung: 'false' })}
        open
        onClose={() => {}}
      />
    );

    expect(screen.queryByText(/Verstärkerpumpen?$/)).not.toBeInTheDocument();

    await user.click(
      screen.getByLabelText('Rechner für diese Leitung verwenden')
    );
    await waitFor(() => expect(pumpCount()).toBeGreaterThan(0));
  });
});
