import { describe, expect, it } from 'vitest';
import {
  capabilitiesUrl,
  childText,
  parseWmsCapabilities,
  parseXml,
  stripWmsRequestParams,
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
