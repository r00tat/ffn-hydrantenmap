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

const showSnackbar = vi.fn();
vi.mock('../../providers/SnackbarProvider', () => ({
  useSnackbar: () => showSnackbar,
}));

vi.mock('../../../hooks/useFirecall', () => ({
  useFirecallId: () => 'einsatz-1',
}));

// Die Höhenabfrage ist ein Netzaufruf über eine Server-Action und hängt am
// Firestore-Client; hier zählt nur, **dass** das Panel sie von selbst auslöst.
const ensureElevation = vi.fn((_firecallId: string, _item: unknown) =>
  Promise.resolve(undefined)
);
vi.mock(
  '../../FirecallItems/elements/connection/foerderung/ensureConnectionElevation',
  () => ({
    ensureConnectionElevation: (firecallId: string, item: unknown) =>
      ensureElevation(firecallId, item),
  })
);

// Die Hydrantensuche geht über den Firestore-Client; hier zählt nur, welche
// Ergiebigkeit der Rechner damit bekommt.
const HYDRANT = { name: 'HY-1', distance: 20, leistung: 800 };
const fuellstelle = vi.fn();
vi.mock('../../../hooks/useFuellstelle', () => ({
  default: () => fuellstelle(),
}));

import { elevationSignature, foerderungSamples } from '../../FirecallItems/elements/connection/foerderung/elevationProfile';
import { FINE_SAMPLING } from '../../FirecallItems/elements/connection/foerderung/elevationSampling';

/** Signatur zur gewünschten, feinen Abtastung. */
const signature = (samples: Parameters<typeof elevationSignature>[0]) =>
  elevationSignature(samples, FINE_SAMPLING.spacingM);

import { routingSignature } from '../../FirecallItems/elements/connection/routedPath';
import LoeschwasserfoerderungPanel from './LoeschwasserfoerderungPanel';

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
    elevationFor: signature(samples),
    elevationSpacing: String(FINE_SAMPLING.spacingM),
  } as Connection;
};

/**
 * Dieselbe Leitung mit Profil, auf Fahrzeug-Routing gestellt: Im Pendelverkehr
 * **ist** die Leitung die Fahrstrecke.
 */
const withRoute = (overrides: Partial<Connection> = {}): Connection =>
  ({
    ...withProfile(overrides),
    streetRouting: 'true',
    routingProfile: 'drive',
    routedPositions: JSON.stringify([entnahme, verteiler]),
    routedFor: routingSignature([entnahme, verteiler], 'walk').replace(
      'walk:',
      'drive:'
    ),
  }) as Connection;

const pumpCount = () =>
  Number(
    /(\d+)/.exec(
      screen.getByText(/Verstärkerpumpen?$/).textContent ?? ''
    )?.[1] ?? 0
  );

describe('LoeschwasserfoerderungPanel', () => {
  beforeEach(() => {
    addItem.mockClear();
    updateItem.mockClear();
    showSnackbar.mockClear();
    ensureElevation.mockClear();
    // `mockReset` und nicht `mockClear`: Ein Test setzt „kein Hydrant", und das
    // dürfte sonst in alle folgenden durchschlagen.
    fuellstelle.mockReset();
    fuellstelle.mockReturnValue({ fuellstelle: HYDRANT, busy: false });
  });

  it('zeigt Lage und Ergebnis aus dem gespeicherten Profil', () => {
    renderWithIntl(
      <LoeschwasserfoerderungPanel
        item={withProfile()}
        open
        onClose={() => {}}
      />
    );

    // Die Länge steht unter ihrer Beschriftung; die Abschnittstabelle nennt
    // dieselbe Zahl noch einmal, deshalb gezielt am Label entlang gesucht.
    // Sie kommt aus der Leaflet-Messung und ist rund 2000 m, nicht exakt — und
    // mit deutschem Tausenderpunkt, weil die Zahlen über `useFormatter` laufen.
    expect(
      screen.getByText('Länge der Leitung').nextElementSibling
    ).toHaveTextContent(/^(1\.9|2\.0)\d\d m$/);
    // Ohne `elevationSource` gilt die Rückfallebene, und sie wird als solche
    // ausgewiesen: sonst ist eine Abweichung gegenüber einem früheren
    // Ergebnis nicht zuordenbar.
    expect(screen.getByText(/EU-DEM 25 m/)).toBeInTheDocument();
    // …mit der Abtastweite, die am Element steht.
    expect(screen.getByText(/alle 10 m abgetastet/)).toBeInTheDocument();
    expect(pumpCount()).toBeGreaterThan(0);
  });

  it('rechnet die Pumpenzahl bei einer neuen geforderten Menge neu', async () => {
    const user = userEvent.setup();
    renderWithIntl(
      <LoeschwasserfoerderungPanel
        item={withProfile({ foerderMenge: 400 })}
        open
        onClose={() => {}}
      />
    );

    const before = pumpCount();
    // Die Menge heißt „Geforderte Menge": Sie ist die Anforderung an der
    // Einsatzstelle und gilt für Förderung wie Pendelverkehr.
    const flowField = screen.getByRole('spinbutton', {
      name: /Geforderte Menge/,
    });
    await user.clear(flowField);
    await user.type(flowField, '1600');

    await waitFor(() => expect(pumpCount()).toBeGreaterThan(before));
  });

  it('warnt ohne Höhendaten und gibt das Höhenfeld frei', async () => {
    renderWithIntl(
      <LoeschwasserfoerderungPanel
        item={connection()}
        open
        onClose={() => {}}
      />
    );

    // Erst nachdem die Abfrage durch ist: Solange sie läuft, steht der
    // Ladehinweis da und nicht die Warnung.
    expect(
      await screen.findByText(/Keine Höhendaten verfügbar/)
    ).toBeInTheDocument();
    expect(
      screen.getByRole('spinbutton', { name: /Höhenunterschied/ })
    ).toBeEnabled();
  });

  it('sperrt das Höhenfeld, solange ein Profil vorliegt', () => {
    renderWithIntl(
      <LoeschwasserfoerderungPanel
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
      <LoeschwasserfoerderungPanel
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
      <LoeschwasserfoerderungPanel item={item} open onClose={() => {}} />
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

  it('speichert die Parameter beim Übernehmen und bleibt offen', async () => {
    // Das Panel ist nicht modal: Wer die Werte festhält, arbeitet meist weiter
    // an der Lage und will es nicht erst wieder aufmachen müssen.
    const user = userEvent.setup();
    const onClose = vi.fn();
    renderWithIntl(
      <LoeschwasserfoerderungPanel
        item={withProfile()}
        open
        onClose={onClose}
      />
    );

    await user.click(screen.getByRole('button', { name: 'Übernehmen' }));

    await waitFor(() =>
      expect(updateItem).toHaveBeenCalledWith(
        expect.objectContaining({
          foerderung: 'true',
          foerderMenge: 1000,
          zielDruck: 6,
          pumpenAusgangsdruck: 8,
        })
      )
    );
    expect(onClose).not.toHaveBeenCalled();
    expect(showSnackbar).toHaveBeenCalled();
  });

  it('rendert nichts, wenn es geschlossen ist', () => {
    renderWithIntl(
      <LoeschwasserfoerderungPanel
        item={withProfile()}
        open={false}
        onClose={() => {}}
      />
    );
    expect(screen.queryByText('Löschwasserförderung')).not.toBeInTheDocument();
  });

  it('klappt den Inhalt ein und lässt die Kopfzeile stehen', async () => {
    const user = userEvent.setup();
    renderWithIntl(
      <LoeschwasserfoerderungPanel item={withProfile()} open onClose={() => {}} />
    );

    expect(pumpCount()).toBeGreaterThan(0);
    await user.click(screen.getByRole('button', { name: 'Einklappen' }));

    await waitFor(() =>
      expect(screen.queryByRole('button', { name: 'Übernehmen' })).not.toBeInTheDocument()
    );
    // Die Kopfzeile bleibt, damit man es wieder aufklappen kann.
    expect(screen.getByRole('button', { name: 'Ausklappen' })).toBeInTheDocument();
  });

  it('schließt über das Kreuz', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    renderWithIntl(
      <LoeschwasserfoerderungPanel item={withProfile()} open onClose={onClose} />
    );

    await user.click(screen.getByRole('button', { name: 'Schließen' }));
    expect(onClose).toHaveBeenCalled();
  });

  it('rechnet ab dem Öffnen und hört mit dem Schalter auf', async () => {
    const user = userEvent.setup();
    renderWithIntl(
      <LoeschwasserfoerderungPanel
        item={withProfile({ foerderung: 'false' })}
        open
        onClose={() => {}}
      />
    );

    // Das Öffnen schaltet ein — ohne Zutun steht das Ergebnis da.
    expect(pumpCount()).toBeGreaterThan(0);

    await user.click(
      screen.getByLabelText('Rechner für diese Leitung verwenden')
    );
    await waitFor(() =>
      expect(screen.queryByText(/Verstärkerpumpen?$/)).not.toBeInTheDocument()
    );
  });

  it('schaltet den Rechner mit dem Öffnen ein und hält das fest', async () => {
    renderWithIntl(
      <LoeschwasserfoerderungPanel
        item={withProfile({ foerderung: undefined })}
        open
        onClose={() => {}}
      />
    );

    // Sonst stünde der Rechner nur im Panel auf „an": Die Pumpen an der Karte
    // und die Zusammenfassung am Element hängen am gespeicherten Feld.
    await waitFor(() =>
      expect(updateItem).toHaveBeenCalledWith(
        expect.objectContaining({ foerderung: 'true' })
      )
    );
  });

  it('holt fehlende Höhendaten beim Öffnen, ohne Speichern', async () => {
    renderWithIntl(
      <LoeschwasserfoerderungPanel
        item={connection()}
        open
        onClose={() => {}}
      />
    );

    await waitFor(() => expect(ensureElevation).toHaveBeenCalledTimes(1));
    expect(updateItem).not.toHaveBeenCalled();
  });

  it('fragt nicht erneut ab, wenn das Profil schon vorliegt', async () => {
    renderWithIntl(
      <LoeschwasserfoerderungPanel
        item={withProfile()}
        open
        onClose={() => {}}
      />
    );

    await waitFor(() => expect(pumpCount()).toBeGreaterThan(0));
    expect(ensureElevation).not.toHaveBeenCalled();
  });

  it('weist aus, dass die Höhen aus dem eigenen Modell kommen', () => {
    renderWithIntl(
      <LoeschwasserfoerderungPanel
        item={withProfile({
          elevationSource: 'terrain',
          elevationLevel: 'detail',
        })}
        open
        onClose={() => {}}
      />
    );
    expect(
      screen.getByText(/BEV ALS-DGM, 1 m Raster.*alle 10 m abgetastet/)
    ).toBeInTheDocument();
    // Die alte, festverdrahtete Angabe darf nicht mehr dastehen.
    expect(screen.queryByText(/EU-DEM 25 m/)).not.toBeInTheDocument();
  });

  it('nennt die Übersichtsstufe, wenn sie geantwortet hat', () => {
    renderWithIntl(
      <LoeschwasserfoerderungPanel
        item={withProfile({
          elevationSource: 'terrain',
          elevationLevel: 'overview',
        })}
        open
        onClose={() => {}}
      />
    );
    // 10 m Raster ist ein anderes Versprechen als 1 m.
    expect(
      screen.getByText(/Übersichtsstufe, 10 m Raster/)
    ).toBeInTheDocument();
  });

  it('zeigt die Förderrichtung und kehrt sie um', async () => {
    const user = userEvent.setup();
    renderWithIntl(
      <LoeschwasserfoerderungPanel
        item={withProfile()}
        open
        onClose={() => {}}
      />
    );

    expect(screen.getByText('Punkt 1 → Punkt 2')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Richtung umkehren/ }));
    expect(screen.getByText('Punkt 2 → Punkt 1')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Übernehmen' }));
    await waitFor(() =>
      expect(updateItem).toHaveBeenCalledWith(
        expect.objectContaining({ foerderungUmgekehrt: 'true' })
      )
    );
  });

  it('schaltet auf Pendelverkehr um und rechnet dort', async () => {
    const user = userEvent.setup();
    renderWithIntl(
      <LoeschwasserfoerderungPanel
        item={withRoute({ versorgungsart: 'pendel' })}
        open
        onClose={() => {}}
      />
    );

    // 2000 m, 2 Fahrzeuge à 2000 l, 40 km/h, 800 l/min am Hydranten,
    // 1 min Rangieren, 3 min Entleeren ⇒ Umlauf 12,5 min.
    expect(screen.getByText(/l\/min dauerhaft/)).toBeInTheDocument();
    // Deutsches Dezimalkomma: Die Zahlen laufen über `useFormatter`.
    expect(screen.getByText(/^Umlaufzeit: 12,5 min$/)).toBeInTheDocument();
    // Keine Pumpenzahl mehr — in dieser Lage wird keine Leitung gelegt.
    expect(screen.queryByText(/Verstärkerpumpen?$/)).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Pumpen als Marker ablegen' })
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Förderung' }));
    expect(screen.getByText(/Verstärkerpumpen?$/)).toBeInTheDocument();
  });

  it('speichert die gewählte Versorgungsart', async () => {
    const user = userEvent.setup();
    renderWithIntl(
      <LoeschwasserfoerderungPanel
        item={withRoute()}
        open
        onClose={() => {}}
      />
    );

    await user.click(screen.getByRole('button', { name: 'Pendelverkehr' }));
    await user.click(screen.getByRole('button', { name: 'Übernehmen' }));
    await waitFor(() =>
      expect(updateItem).toHaveBeenCalledWith(
        expect.objectContaining({ versorgungsart: 'pendel' })
      )
    );
  });

  it('warnt im Pendelverkehr, wenn die Entnahmestelle deckelt', async () => {
    const user = userEvent.setup();
    renderWithIntl(
      <LoeschwasserfoerderungPanel
        item={withRoute({ versorgungsart: 'pendel', pendelFahrzeuge: 8 })}
        open
        onClose={() => {}}
      />
    );

    expect(
      screen.getByText(/Entnahmestelle gibt nur \d+ l\/min her/)
    ).toBeInTheDocument();
    // Mit weniger Fahrzeugen greift die Schranke nicht.
    const field = screen.getByRole('spinbutton', { name: 'Tanklöschfahrzeuge' });
    await user.clear(field);
    await user.type(field, '2');
    await waitFor(() =>
      expect(
        screen.queryByText(/Entnahmestelle gibt nur/)
      ).not.toBeInTheDocument()
    );
  });

  it('nimmt die Ergiebigkeit aus dem Hydranten an der Entnahmestelle', async () => {
    renderWithIntl(
      <LoeschwasserfoerderungPanel
        item={withRoute({ versorgungsart: 'pendel' })}
        open
        onClose={() => {}}
      />
    );

    expect(
      screen.getByRole('spinbutton', { name: /Ergiebigkeit/ })
    ).toHaveValue(800);
    expect(screen.getByText(/aus HY-1, 20 m entfernt/)).toBeInTheDocument();
  });

  it('rechnet ohne Hydrant nicht, sondern fragt', async () => {
    fuellstelle.mockReturnValue({ fuellstelle: undefined, busy: false });
    renderWithIntl(
      <LoeschwasserfoerderungPanel
        item={withRoute({ versorgungsart: 'pendel' })}
        open
        onClose={() => {}}
      />
    );

    expect(
      screen.getByText(/Ohne die Ergiebigkeit der Entnahmestelle/)
    ).toBeInTheDocument();
    expect(screen.queryByText(/l\/min dauerhaft/)).not.toBeInTheDocument();
    expect(
      screen.getByText(/Kein Hydrant in 100 m um die Entnahmestelle/)
    ).toBeInTheDocument();
  });

  it('nennt den Hydranten, dem die Leistungsangabe fehlt', async () => {
    // Der Normalfall in den Daten. „Kein Hydrant in 100 m" widerspricht dem,
    // was der Melder auf der Karte vor sich hat, und lässt offen, ob die Suche
    // überhaupt gelaufen ist.
    fuellstelle.mockReturnValue({
      fuellstelle: undefined,
      naechsterHydrant: { name: 'HY44', distance: 12 },
      busy: false,
    });
    renderWithIntl(
      <LoeschwasserfoerderungPanel
        item={withRoute({ versorgungsart: 'pendel' })}
        open
        onClose={() => {}}
      />
    );

    expect(
      screen.getByText(/HY44 in 12 m hat keine Leistungsangabe/)
    ).toBeInTheDocument();
    expect(
      screen.queryByText(/Kein Hydrant in 100 m/)
    ).not.toBeInTheDocument();
  });

  it('bietet an, die Leitung auf Fahrzeug-Routing umzustellen', async () => {
    const user = userEvent.setup();
    renderWithIntl(
      <LoeschwasserfoerderungPanel
        // Ohne Fahrzeug-Routing: Die Fahrstrecke ist die gezeichnete Linie.
        item={withProfile({ versorgungsart: 'pendel' })}
        open
        onClose={() => {}}
      />
    );

    expect(screen.getByText(/gezeichnete Linie/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Umstellen' }));
    await waitFor(() =>
      expect(updateItem).toHaveBeenCalledWith(
        expect.objectContaining({
          streetRouting: 'true',
          routingProfile: 'drive',
        })
      )
    );
  });

  it('stellt im Vergleich beide Varianten gegenüber und empfiehlt eine', () => {
    renderWithIntl(
      <LoeschwasserfoerderungPanel
        item={withRoute({ versorgungsart: 'vergleich', foerderMenge: 400 })}
        open
        onClose={() => {}}
      />
    );

    expect(screen.getByText('Menge')).toBeInTheDocument();
    expect(screen.getByText('Aufbauzeit')).toBeInTheDocument();
    expect(screen.getByText('Gebundene Fahrzeuge')).toBeInTheDocument();
    expect(screen.getByText('Engstelle')).toBeInTheDocument();
    expect(
      screen.getByText(/trägt die Lage|trägt .* dauerhaft|Entscheidung fällt/)
    ).toBeInTheDocument();
  });

  it('kennzeichnet die Annahmen der Aufbauzeit als Planungswerte', async () => {
    const user = userEvent.setup();
    renderWithIntl(
      <LoeschwasserfoerderungPanel
        item={withRoute({ versorgungsart: 'vergleich' })}
        open
        onClose={() => {}}
      />
    );

    await user.click(
      screen.getByRole('button', { name: /Annahmen zur Aufbauzeit/ })
    );
    expect(screen.getByText(/stehen in keiner Unterlage/)).toBeInTheDocument();
    expect(
      screen.getByRole('spinbutton', { name: /Verlegeleistung/ })
    ).toHaveValue(100);
  });

  it('nennt keine Quelle mehr im Panel', () => {
    renderWithIntl(
      <LoeschwasserfoerderungPanel
        item={withProfile()}
        open
        onClose={() => {}}
      />
    );
    expect(screen.queryByText(/Ausbildungsunterlage/)).not.toBeInTheDocument();
  });
});
