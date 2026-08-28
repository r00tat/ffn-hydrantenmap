// @vitest-environment jsdom
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { KNOWN_WMS_SERVICES } from '../../../common/knownWmsServices';
import { renderWithIntl } from '../../../test-utils/intlRender';

const loadWmsCapabilities = vi.fn();
vi.mock('../../../app/actions/mapCapabilities', () => ({
  loadWmsCapabilities: (...args: unknown[]) =>
    loadWmsCapabilities(...(args as [])),
}));

const { default: MapLayerDialog } = await import('./MapLayerDialog');

beforeEach(() => {
  vi.clearAllMocks();
});

async function fill(label: RegExp | string, value: string) {
  const field = screen.getByLabelText(label);
  await userEvent.clear(field);
  await userEvent.type(field, value);
}

describe('MapLayerDialog', () => {
  it('speichert eine gültige WMS-Ebene', async () => {
    const onClose = vi.fn();
    renderWithIntl(<MapLayerDialog onClose={onClose} />);

    await fill(/^Name/, 'Nachbarbezirk');
    await fill(/^URL/, 'https://gis.example.at/wms?');
    await fill(/^Layer \(LAYERS\)/, '1');
    await userEvent.click(screen.getByRole('button', { name: 'Hinzufügen' }));

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onClose.mock.calls[0][0]).toMatchObject({
      name: 'Nachbarbezirk',
      overlayType: 'WMS',
      url: 'https://gis.example.at/wms?',
      wmsLayers: '1',
    });
  });

  it('weist eine http-Adresse ab und speichert nicht', async () => {
    const onClose = vi.fn();
    renderWithIntl(<MapLayerDialog onClose={onClose} />);

    await fill(/^Name/, 'Unsicher');
    await fill(/^URL/, 'http://gis.example.at/wms?');
    await fill(/^Layer \(LAYERS\)/, '1');
    await userEvent.click(screen.getByRole('button', { name: 'Hinzufügen' }));

    expect(onClose).not.toHaveBeenCalled();
    expect(
      screen.getByText('Nur https-Adressen sind erlaubt')
    ).toBeInTheDocument();
  });

  it('verlangt bei einer Kachel-Ebene die Platzhalter im Template', async () => {
    const onClose = vi.fn();
    renderWithIntl(<MapLayerDialog onClose={onClose} />);

    await userEvent.click(screen.getByLabelText('Typ'));
    await userEvent.click(
      screen.getByRole('option', { name: 'Kachel-URL (WMTS/XYZ)' })
    );

    await fill(/^Name/, 'Kacheln');
    await fill(/^URL/, 'https://a.org/tiles.png');
    await userEvent.click(screen.getByRole('button', { name: 'Hinzufügen' }));

    expect(onClose).not.toHaveBeenCalled();
    // Die geschweiften Klammern kommen aus dem ICU-Katalog und müssen dort
    // maskiert sein, sonst versucht next-intl sie als Platzhalter zu füllen.
    expect(
      screen.getByText('Das Template braucht {z}, {x} und {y}')
    ).toBeInTheDocument();
  });

  it('übernimmt Layer und Ausdehnung aus GetCapabilities', async () => {
    loadWmsCapabilities.mockResolvedValue({
      serviceUrl: 'https://gis.example.at/wms?',
      title: 'Orthofoto Burgenland',
      formats: ['image/png', 'image/jpeg'],
      layers: [
        {
          name: '1',
          title: 'Orthofoto aktuell',
          abstract: 'Luftbild, 20 cm',
          bounds: '46.82,15.98,48.16,17.17',
          attribution: 'Land Burgenland',
          maxNativeZoom: 19,
          crs: ['EPSG:3857'],
          depth: 0,
        },
        {
          name: '2',
          title: 'Orthofoto 2020',
          crs: ['EPSG:3857'],
          depth: 0,
        },
      ],
    });
    const onClose = vi.fn();
    renderWithIntl(<MapLayerDialog onClose={onClose} />);

    await fill(/^URL/, 'https://gis.example.at/wms?REQUEST=GetCapabilities');
    await userEvent.click(
      screen.getByRole('button', { name: /Layer aus dem Dienst laden/ })
    );

    await waitFor(() =>
      expect(screen.getByLabelText('Gefundene Layer')).toBeInTheDocument()
    );
    await userEvent.click(screen.getByLabelText('Gefundene Layer'));
    await userEvent.click(
      screen.getByRole('option', { name: /Orthofoto aktuell/ })
    );
    await userEvent.keyboard('{Escape}');

    await userEvent.click(screen.getByRole('button', { name: 'Hinzufügen' }));

    expect(onClose).toHaveBeenCalledTimes(1);
    // Alles, was der Dienst über den Layer sagt, steht im Formular.
    expect(onClose.mock.calls[0][0]).toMatchObject({
      name: 'Orthofoto aktuell',
      beschreibung: 'Luftbild, 20 cm',
      url: 'https://gis.example.at/wms?',
      wmsLayers: '1',
      bounds: '46.82,15.98,48.16,17.17',
      attribution: 'Land Burgenland',
      maxNativeZoom: 19,
      format: 'image/png',
    });
  });

  it('warnt vor einem Layer, den Leaflet nicht anfragen kann', async () => {
    loadWmsCapabilities.mockResolvedValue({
      serviceUrl: 'https://gis.example.at/wms?',
      formats: ['image/png'],
      layers: [
        {
          name: 'gk',
          title: 'Nur GK M34',
          crs: ['EPSG:31256'],
          depth: 0,
        },
      ],
    });
    renderWithIntl(<MapLayerDialog onClose={vi.fn()} />);

    await fill(/^URL/, 'https://gis.example.at/wms?');
    await userEvent.click(
      screen.getByRole('button', { name: /Layer aus dem Dienst laden/ })
    );

    // Der einzige Layer wird automatisch übernommen — und beanstandet.
    // Der Offline-Hinweis ist ebenfalls ein Alert — gesucht ist der zur Warnung.
    const warning = await waitFor(() => {
      const found = screen
        .getAllByRole('alert')
        .find((el) => el.textContent?.includes('EPSG:3857'));
      if (!found) throw new Error('Warnung zum Koordinatensystem fehlt');
      return found;
    });
    expect(warning).toHaveTextContent('Nur GK M34');
  });

  it('merkt sich die abgefragte Adresse getrennt von der Kartenadresse', async () => {
    // Der Dienst nennt eine andere GetMap-Adresse als die eingegebene. Beide
    // müssen erhalten bleiben: die eine liefert Kacheln, die andere Metadaten.
    loadWmsCapabilities.mockResolvedValue({
      serviceUrl: 'https://karten.example.at/mapserv?map=ortho&',
      formats: ['image/png'],
      layers: [{ name: '1', title: 'Orthofoto', crs: ['EPSG:3857'], depth: 0 }],
    });
    const onClose = vi.fn();
    renderWithIntl(<MapLayerDialog onClose={onClose} />);

    await fill(/^Name/, 'Ortho');
    await fill(/^URL/, 'https://gis.example.at/static/caps.xml');
    await userEvent.click(
      screen.getByRole('button', { name: /Layer aus dem Dienst laden/ })
    );

    await waitFor(() =>
      expect(screen.getByLabelText(/^URL/)).toHaveValue(
        'https://karten.example.at/mapserv?map=ortho&'
      )
    );
    expect(screen.getByLabelText(/^GetCapabilities-Adresse/)).toHaveValue(
      'https://gis.example.at/static/caps.xml'
    );

    await userEvent.click(screen.getByRole('button', { name: 'Hinzufügen' }));
    expect(onClose.mock.calls[0][0]).toMatchObject({
      url: 'https://karten.example.at/mapserv?map=ortho&',
      capabilitiesUrl: 'https://gis.example.at/static/caps.xml',
    });
  });

  it('fragt beim Bearbeiten den Dienst gleich ab und hält die Auswahl', async () => {
    loadWmsCapabilities.mockResolvedValue({
      serviceUrl: 'https://karten.example.at/mapserv?',
      formats: ['image/png', 'image/jpeg'],
      layers: [
        { name: '1', title: 'Orthofoto aktuell', crs: ['EPSG:3857'], depth: 0 },
        {
          name: '2',
          title: 'Orthofoto 2020',
          abstract: 'Luftbild 2020',
          crs: ['EPSG:3857'],
          depth: 0,
        },
      ],
    });
    const onClose = vi.fn();
    renderWithIntl(
      <MapLayerDialog
        onClose={onClose}
        layer={{
          id: 'x',
          name: 'Eigener Name',
          overlayType: 'WMS',
          url: 'https://karten.example.at/mapserv?',
          capabilitiesUrl: 'https://gis.example.at/static/caps.xml',
          wmsLayers: '2',
          format: 'image/jpeg',
        }}
      />
    );

    // Abgefragt wird die gemerkte Capabilities-Adresse, nicht die Kartenadresse.
    await waitFor(() =>
      expect(loadWmsCapabilities).toHaveBeenCalledWith(
        'https://gis.example.at/static/caps.xml'
      )
    );
    // Die Auswahl steht ohne Zutun bereit und zeigt den gespeicherten Layer.
    await waitFor(() =>
      expect(screen.getByText('Orthofoto 2020 (2)')).toBeInTheDocument()
    );

    await userEvent.click(screen.getByRole('button', { name: 'Speichern' }));
    // Das bloße Öffnen darf nichts überschrieben haben.
    expect(onClose.mock.calls[0][0]).toMatchObject({
      name: 'Eigener Name',
      wmsLayers: '2',
      format: 'image/jpeg',
    });
    expect(onClose.mock.calls[0][0].beschreibung).toBeUndefined();
  });

  it('hakt mehrere Layer an und reiht sie in den LAYERS-Wert', async () => {
    // Ein Dienst mit vielen Layern: die Liste bleibt beim Anhaken offen, und
    // das Tippen filtert sie — sonst findet man in 64 Einträgen nichts.
    loadWmsCapabilities.mockResolvedValue({
      serviceUrl: 'https://gis.example.at/wms?',
      formats: ['image/png'],
      layers: [
        { name: 'hq30', title: 'Hochwasser HQ30', crs: ['EPSG:3857'], depth: 0 },
        { name: 'hq100', title: 'Hochwasser HQ100', crs: ['EPSG:3857'], depth: 0 },
        { name: 'wald', title: 'Waldkataster', crs: ['EPSG:3857'], depth: 0 },
      ],
    });
    const onClose = vi.fn();
    renderWithIntl(<MapLayerDialog onClose={onClose} />);

    await fill(/^Name/, 'Hochwasser');
    await fill(/^URL/, 'https://gis.example.at/wms?');
    await userEvent.click(
      screen.getByRole('button', { name: /Layer aus dem Dienst laden/ })
    );

    const auswahl = await screen.findByLabelText('Gefundene Layer');
    await userEvent.click(auswahl);
    await userEvent.type(auswahl, 'Hochwasser');
    // Gefiltert wird auf die beiden Hochwasser-Layer.
    await waitFor(() => expect(screen.getAllByRole('option')).toHaveLength(2));

    await userEvent.click(screen.getByRole('option', { name: /HQ30/ }));
    // Die Liste bleibt offen: der zweite Haken ohne erneutes Aufklappen.
    await userEvent.click(screen.getByRole('option', { name: /HQ100/ }));
    await userEvent.keyboard('{Escape}');

    await userEvent.click(screen.getByRole('button', { name: 'Hinzufügen' }));
    expect(onClose.mock.calls[0][0]).toMatchObject({ wmsLayers: 'hq30,hq100' });
  });

  it('fragt einen bekannten Dienst ohne Eingabe einer Adresse ab', async () => {
    loadWmsCapabilities.mockResolvedValue({
      serviceUrl: 'https://inspire.lfrz.gv.at/000801/wms?',
      formats: ['image/png'],
      layers: [
        { name: 'hq100', title: 'Hochwasser HQ100', crs: ['EPSG:3857'], depth: 0 },
      ],
    });
    const onClose = vi.fn();
    renderWithIntl(<MapLayerDialog onClose={onClose} />);

    await userEvent.click(screen.getByLabelText('Bekannter Dienst'));
    await userEvent.click(
      screen.getByRole('option', { name: /INSPIRE Hochwasser/ })
    );

    // Die Auswahl fragt sofort ab — kein zusätzlicher Knopfdruck.
    await waitFor(() =>
      expect(loadWmsCapabilities).toHaveBeenCalledWith(
        KNOWN_WMS_SERVICES.find((s) => s.id === 'inspire-hochwasser')
          ?.capabilitiesUrl
      )
    );
    // Der einzige Layer des Dienstes wird übernommen.
    await waitFor(() =>
      expect(screen.getByLabelText(/^Layer \(LAYERS\)/)).toHaveValue('hq100')
    );
    expect(screen.getByLabelText(/^URL/)).toHaveValue(
      'https://inspire.lfrz.gv.at/000801/wms?'
    );
  });

  it('bietet beim Bearbeiten das Löschen an', async () => {
    const onDelete = vi.fn();
    const onClose = vi.fn();
    renderWithIntl(
      <MapLayerDialog
        onClose={onClose}
        onDelete={onDelete}
        layer={{
          id: 'x',
          name: 'Alt',
          overlayType: 'WMTS',
          url: 'https://a.org/{z}/{x}/{y}.png',
        }}
      />
    );

    await userEvent.click(screen.getByRole('button', { name: 'Löschen' }));
    expect(onDelete).toHaveBeenCalledTimes(1);
    // Der Dialog fragt nicht selbst nach — das tut der Aufrufer.
    expect(onClose).not.toHaveBeenCalled();
  });

  it('zeigt beim Anlegen keinen Löschen-Knopf', async () => {
    renderWithIntl(<MapLayerDialog onClose={vi.fn()} onDelete={vi.fn()} />);
    expect(
      screen.queryByRole('button', { name: 'Löschen' })
    ).not.toBeInTheDocument();
  });

  it('meldet einen nicht erreichbaren Dienst, ohne die Eingabe zu verlieren', async () => {
    loadWmsCapabilities.mockResolvedValue({
      serviceUrl: '',
      formats: [],
      layers: [],
      error: 'unreachable',
    });
    renderWithIntl(<MapLayerDialog onClose={vi.fn()} />);

    await fill(/^URL/, 'https://gis.example.at/wms?');
    await userEvent.click(
      screen.getByRole('button', { name: /Layer aus dem Dienst laden/ })
    );

    await waitFor(() =>
      expect(
        screen.getByText('Der Dienst hat nicht geantwortet.')
      ).toBeInTheDocument()
    );
    expect(screen.getByLabelText(/^URL/)).toHaveValue(
      'https://gis.example.at/wms?'
    );
  });
});
