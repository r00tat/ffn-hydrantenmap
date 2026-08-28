import { describe, expect, it } from 'vitest';
import {
  capabilitiesUrl,
  childText,
  parseWmsCapabilities,
  parseXml,
  stripWmsRequestParams,
  zoomFromScaleDenominator,
  zoomFromScaleHint,
} from './wmsCapabilities';

const capabilities130 = `<?xml version="1.0" encoding="UTF-8"?>
<WMS_Capabilities version="1.3.0" xmlns="http://www.opengis.net/wms">
  <Service>
    <Name>WMS</Name>
    <Title>Orthofoto Burgenland</Title>
  </Service>
  <Capability>
    <Request>
      <GetMap>
        <Format>image/png</Format>
        <Format>image/jpeg</Format>
      </GetMap>
    </Request>
    <Layer>
      <Title>public/Orthofoto</Title>
      <EX_GeographicBoundingBox>
        <westBoundLongitude>15.98</westBoundLongitude>
        <eastBoundLongitude>17.17</eastBoundLongitude>
        <southBoundLatitude>46.82</southBoundLatitude>
        <northBoundLatitude>48.16</northBoundLatitude>
      </EX_GeographicBoundingBox>
      <Layer queryable="1">
        <Name>0</Name>
        <Title>Orthofoto 2020</Title>
      </Layer>
      <Layer queryable="1">
        <Name>1</Name>
        <Title>Orthofoto aktuell</Title>
        <EX_GeographicBoundingBox>
          <westBoundLongitude>16.0</westBoundLongitude>
          <eastBoundLongitude>17.0</eastBoundLongitude>
          <southBoundLatitude>47.0</southBoundLatitude>
          <northBoundLatitude>48.0</northBoundLatitude>
        </EX_GeographicBoundingBox>
      </Layer>
    </Layer>
  </Capability>
</WMS_Capabilities>`;

const capabilities111 = `<?xml version="1.0"?>
<!DOCTYPE WMT_MS_Capabilities SYSTEM "http://schemas.opengis.net/wms/1.1.1/WMS_MS_Capabilities.dtd">
<WMT_MS_Capabilities version="1.1.1">
  <Service><Title>WISA</Title></Service>
  <Capability>
    <Request><GetMap><Format>image/png</Format></GetMap></Request>
    <Layer>
      <Title>wisa</Title>
      <LatLonBoundingBox minx="8.78" miny="46.35" maxx="17.18" maxy="49.03"/>
      <Layer>
        <Name>ofa_maxd</Name>
        <Title>Oberflächenabfluss</Title>
      </Layer>
    </Layer>
  </Capability>
</WMT_MS_Capabilities>`;

describe('parseXml', () => {
  it('baut einen Baum mit Attributen und Text', () => {
    const doc = parseXml('<a x="1"><b>Text</b><c/></a>');
    const a = doc.children[0];
    expect(a.name).toBe('a');
    expect(a.attributes.x).toBe('1');
    expect(childText(a, 'b')).toBe('Text');
    expect(a.children.map((n) => n.name)).toEqual(['b', 'c']);
  });

  it('ignoriert Namensraum-Präfixe', () => {
    const doc = parseXml('<wms:Layer><wms:Name>1</wms:Name></wms:Layer>');
    expect(childText(doc.children[0], 'Name')).toBe('1');
  });

  it('übergeht Kommentare', () => {
    const doc = parseXml('<a><!-- <b>x</b> --><c>1</c></a>');
    expect(doc.children[0].children.map((n) => n.name)).toEqual(['c']);
  });

  it('löst Entities auf', () => {
    const doc = parseXml('<a>Land &amp; Leute &lt;1&gt;</a>');
    expect(doc.children[0].text.trim()).toBe('Land & Leute <1>');
  });

  it('verwirft ein unpassendes Ende-Tag, statt den Baum zu verlieren', () => {
    const doc = parseXml('<a><b>1</x></b><c>2</c></a>');
    expect(childText(doc.children[0], 'c')).toBe('2');
  });
});

describe('parseWmsCapabilities', () => {
  it('liest Titel, Version und Formate', () => {
    const caps = parseWmsCapabilities(capabilities130);
    expect(caps.title).toBe('Orthofoto Burgenland');
    expect(caps.version).toBe('1.3.0');
    expect(caps.formats).toEqual(['image/png', 'image/jpeg']);
  });

  it('liefert nur Layer mit Name', () => {
    const caps = parseWmsCapabilities(capabilities130);
    expect(caps.layers.map((l) => l.name)).toEqual(['0', '1']);
    expect(caps.layers[0].title).toBe('Orthofoto 2020');
  });

  it('vererbt die Ausdehnung des äußeren Layers', () => {
    const caps = parseWmsCapabilities(capabilities130);
    expect(caps.layers[0].bounds).toBe('46.82,15.98,48.16,17.17');
  });

  it('bevorzugt die eigene Ausdehnung', () => {
    const caps = parseWmsCapabilities(capabilities130);
    expect(caps.layers[1].bounds).toBe('47,16,48,17');
  });

  it('liest auch die Fassung 1.1.1 mit LatLonBoundingBox', () => {
    const caps = parseWmsCapabilities(capabilities111);
    expect(caps.title).toBe('WISA');
    expect(caps.layers).toEqual([
      {
        name: 'ofa_maxd',
        title: 'Oberflächenabfluss',
        bounds: '46.35,8.78,49.03,17.18',
        crs: [],
        depth: 0,
      },
    ]);
  });

  it('gibt für Unsinn eine leere Liste zurück', () => {
    expect(parseWmsCapabilities('<html><body>404</body></html>').layers).toEqual(
      []
    );
    expect(parseWmsCapabilities('').layers).toEqual([]);
  });
});

describe('capabilitiesUrl', () => {
  it('setzt die Anfrageparameter', () => {
    const url = new URL(capabilitiesUrl('https://a.org/wms?'));
    expect(url.searchParams.get('SERVICE')).toBe('WMS');
    expect(url.searchParams.get('REQUEST')).toBe('GetCapabilities');
    expect(url.searchParams.get('VERSION')).toBe('1.3.0');
  });

  it('behält fremde Parameter', () => {
    const url = new URL(capabilitiesUrl('https://a.org/wms?map=hochwasser'));
    expect(url.searchParams.get('map')).toBe('hochwasser');
  });

  it('ersetzt eine bereits gesetzte Version', () => {
    const url = new URL(
      capabilitiesUrl('https://a.org/wms?version=1.1.1', '1.3.0')
    );
    expect(url.searchParams.getAll('VERSION')).toEqual(['1.3.0']);
    expect(url.searchParams.has('version')).toBe(false);
  });
});

describe('stripWmsRequestParams', () => {
  it('entfernt die Parameter, die Leaflet selbst setzt', () => {
    expect(
      stripWmsRequestParams(
        'https://a.org/wms?SERVICE=WMS&REQUEST=GetCapabilities&VERSION=1.3.0'
      )
    ).toBe('https://a.org/wms?');
  });

  it('behält fremde Parameter und hängt ein & an', () => {
    expect(
      stripWmsRequestParams('https://a.org/wms?map=hochwasser&REQUEST=GetMap')
    ).toBe('https://a.org/wms?map=hochwasser&');
  });
});

const capabilitiesRich = `<?xml version="1.0"?>
<WMS_Capabilities version="1.3.0">
  <Service>
    <Title>Geodaten Burgenland</Title>
    <Abstract>Offene Geodaten des Landes</Abstract>
    <Attribution><Title>Land Burgenland (CC BY 4.0)</Title></Attribution>
  </Service>
  <Capability>
    <Request><GetMap>
      <Format>image/png</Format>
      <Format>image/jpeg</Format>
    </GetMap></Request>
    <Layer>
      <Title>root</Title>
      <CRS>EPSG:4326</CRS>
      <CRS>EPSG:3857</CRS>
      <EX_GeographicBoundingBox>
        <westBoundLongitude>15.98</westBoundLongitude>
        <eastBoundLongitude>17.17</eastBoundLongitude>
        <southBoundLatitude>46.82</southBoundLatitude>
        <northBoundLatitude>48.16</northBoundLatitude>
      </EX_GeographicBoundingBox>
      <Layer opaque="1">
        <Name>ortho</Name>
        <Title>Orthofoto</Title>
        <Abstract>Luftbild, 20 cm Auflösung</Abstract>
        <MinScaleDenominator>1066</MinScaleDenominator>
      </Layer>
      <Layer>
        <Name>gefahren</Name>
        <Title>Naturgefahren</Title>
        <CRS>EPSG:31256</CRS>
        <Attribution><Title>Abteilung 5</Title></Attribution>
      </Layer>
    </Layer>
  </Capability>
</WMS_Capabilities>`;

describe('zoomFromScaleDenominator', () => {
  // Die Nenner der Standard-Zoomstufen in EPSG:3857.
  it('rechnet die Nenner der Standardstufen zurück', () => {
    expect(zoomFromScaleDenominator(559_082_264)).toBe(0);
    expect(zoomFromScaleDenominator(2_132_729.7)).toBe(8);
    expect(zoomFromScaleDenominator(1066.36)).toBe(19);
  });

  it('lässt einen unsinnigen Wert weg', () => {
    expect(zoomFromScaleDenominator(0)).toBeUndefined();
    expect(zoomFromScaleDenominator(-1)).toBeUndefined();
    expect(zoomFromScaleDenominator(Number.NaN)).toBeUndefined();
  });

  it('verzeiht die Rundung der Dienste', () => {
    // 18,99986 — gemeint ist Stufe 19, nicht 18.
    expect(zoomFromScaleDenominator(1066.5)).toBe(19);
    // Ein echter Zwischenwert wird trotzdem abgerundet.
    expect(zoomFromScaleDenominator(1508)).toBe(18);
  });

  it('gibt jenseits der sinnvollen Tiefe nichts zurück', () => {
    // Ein Dienst, der 1:1 meldet, meint „keine Grenze" — keine Zoomstufe 29.
    expect(zoomFromScaleDenominator(1)).toBeUndefined();
  });
});

describe('zoomFromScaleHint', () => {
  // ScaleHint ist die Pixeldiagonale in Metern, nicht ein Nenner.
  it('rechnet die Diagonale in eine Zoomstufe um', () => {
    // Stufe 19: rund 0,2986 m je Pixel, Diagonale 0,4223 m.
    expect(zoomFromScaleHint(0.4223)).toBe(19);
    // Stufe 0: 156543 m je Pixel, Diagonale 221385 m.
    expect(zoomFromScaleHint(221_384.7)).toBe(0);
  });

  it('behandelt 0 als „keine Grenze"', () => {
    expect(zoomFromScaleHint(0)).toBeUndefined();
  });
});

describe('parseWmsCapabilities — Einstellungen des Layers', () => {
  it('liest die Beschreibung des Dienstes und des Layers', () => {
    const caps = parseWmsCapabilities(capabilitiesRich);
    expect(caps.abstract).toBe('Offene Geodaten des Landes');
    expect(caps.layers[0].abstract).toBe('Luftbild, 20 cm Auflösung');
  });

  it('erbt die Quellenangabe vom Dienst', () => {
    const caps = parseWmsCapabilities(capabilitiesRich);
    expect(caps.layers[0].attribution).toBe('Land Burgenland (CC BY 4.0)');
  });

  it('lässt die eigene Quellenangabe des Layers gewinnen', () => {
    const caps = parseWmsCapabilities(capabilitiesRich);
    expect(caps.layers[1].attribution).toBe('Abteilung 5');
  });

  it('sammelt die Koordinatensysteme und vererbt sie nach innen', () => {
    const caps = parseWmsCapabilities(capabilitiesRich);
    expect(caps.layers[0].crs).toEqual(['EPSG:4326', 'EPSG:3857']);
    expect(caps.layers[1].crs).toEqual([
      'EPSG:4326',
      'EPSG:3857',
      'EPSG:31256',
    ]);
  });

  it('merkt sich opaque', () => {
    const caps = parseWmsCapabilities(capabilitiesRich);
    expect(caps.layers[0].opaque).toBe(true);
    expect(caps.layers[1].opaque).toBeUndefined();
  });

  it('leitet die feinste Zoomstufe aus der Maßstabsgrenze ab', () => {
    const caps = parseWmsCapabilities(capabilitiesRich);
    expect(caps.layers[0].maxNativeZoom).toBe(19);
    expect(caps.layers[1].maxNativeZoom).toBeUndefined();
  });

  it('liest SRS der Fassung 1.1.1, auch mehrere in einem Element', () => {
    const caps = parseWmsCapabilities(`<WMT_MS_Capabilities version="1.1.1">
      <Capability><Layer>
        <SRS>EPSG:4326 EPSG:3857</SRS>
        <Layer><Name>a</Name><Title>A</Title>
          <ScaleHint min="0.4223" max="0"/>
        </Layer>
      </Layer></Capability>
    </WMT_MS_Capabilities>`);
    expect(caps.layers[0].crs).toEqual(['EPSG:4326', 'EPSG:3857']);
    expect(caps.layers[0].maxNativeZoom).toBe(19);
  });
});
