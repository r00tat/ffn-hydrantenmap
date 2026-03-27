// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';

// Mock dependencies needed by FirecallItemBase and its subclasses
vi.mock('server-only', () => ({}));
vi.mock('next/server', () => ({}));
vi.mock('next-auth', () => ({
  default: vi.fn(() => ({
    handlers: {},
    signIn: vi.fn(),
    signOut: vi.fn(),
    auth: vi.fn(),
  })),
}));
vi.mock('next-auth/react', () => ({
  useSession: vi.fn(() => ({ data: null, status: 'unauthenticated' })),
  signOut: vi.fn(),
}));
vi.mock('./firebase', () => ({
  default: {},
  firestore: {},
  db: {},
  auth: {},
}));
vi.mock('firebase/storage', () => ({
  getStorage: vi.fn(),
  ref: vi.fn(),
  getDownloadURL: vi.fn(),
  uploadBytes: vi.fn(),
  deleteObject: vi.fn(),
}));
vi.mock('firebase/firestore', () => ({
  doc: vi.fn(),
  setDoc: vi.fn(),
  getFirestore: vi.fn(),
  collection: vi.fn(),
}));
vi.mock('../../hooks/useMapEditor', () => ({
  useMapEditable: vi.fn(() => false),
}));

import { FirecallItem } from './firestore';
import {
  exportLayerItemsToCsv,
  exportLayerItemsToGpx,
  exportLayerItemsToKml,
} from './layerExport';

// --- Test data helpers ---

function makeMarker(overrides: Partial<FirecallItem> = {}): FirecallItem {
  return {
    id: 'marker1',
    name: 'Test Marker',
    lat: 47.948,
    lng: 16.848,
    alt: 120,
    type: 'marker',
    beschreibung: 'A test marker',
    datum: '2025-06-15T10:00:00Z',
    ...overrides,
  };
}

function makeVehicle(
  overrides: Record<string, unknown> = {},
): FirecallItem {
  return {
    id: 'v1',
    name: 'KLF',
    lat: 47.95,
    lng: 16.85,
    type: 'vehicle',
    beschreibung: '',
    datum: '',
    fw: 'FF Neusiedl',
    besatzung: '6',
    ats: 2,
    alarmierung: '2025-06-15T09:00:00Z',
    eintreffen: '2025-06-15T09:15:00Z',
    abruecken: '',
    ...overrides,
  } as unknown as FirecallItem;
}

function makeHydrant(
  overrides: Record<string, unknown> = {},
): FirecallItem {
  return {
    id: 'h1',
    name: 'Hydrant 1',
    lat: 47.94,
    lng: 16.84,
    type: 'hydrant',
    beschreibung: '',
    datum: '',
    ortschaft: 'Neusiedl',
    typ: 'Überflurhydrant',
    hydranten_nummer: '42',
    fuellhydrant: '',
    dimension: 80,
    leitungsart: 'Ring',
    statischer_druck: 4,
    dynamischer_druck: 2,
    druckmessung_datum: '',
    meereshoehe: 120,
    geohash: 'u2edc',
    leistung: '1500',
    ...overrides,
  } as unknown as FirecallItem;
}

function makeLine(
  overrides: Record<string, unknown> = {},
): FirecallItem {
  return {
    id: 'l1',
    name: 'Test Line',
    lat: 47.948,
    lng: 16.848,
    type: 'line',
    beschreibung: '',
    datum: '',
    destLat: 47.95,
    destLng: 16.86,
    positions: JSON.stringify([
      [47.948, 16.848],
      [47.949, 16.85],
      [47.95, 16.86],
    ]),
    distance: 500,
    color: 'red',
    opacity: 80,
    ...overrides,
  } as unknown as FirecallItem;
}

function makeConnection(
  overrides: Record<string, unknown> = {},
): FirecallItem {
  return {
    id: 'c1',
    name: 'Connection 1',
    lat: 47.948,
    lng: 16.848,
    type: 'connection',
    beschreibung: '',
    datum: '',
    destLat: 47.95,
    destLng: 16.86,
    positions: JSON.stringify([
      [47.948, 16.848],
      [47.95, 16.86],
    ]),
    distance: 300,
    color: 'blue',
    dimension: '75',
    oneHozeLength: 20,
    ...overrides,
  } as unknown as FirecallItem;
}

function makeArea(
  overrides: Record<string, unknown> = {},
): FirecallItem {
  return {
    id: 'a1',
    name: 'Test Area',
    lat: 47.948,
    lng: 16.848,
    type: 'area',
    beschreibung: '',
    datum: '',
    destLat: 47.95,
    destLng: 16.86,
    positions: JSON.stringify([
      [47.948, 16.848],
      [47.949, 16.85],
      [47.95, 16.86],
      [47.948, 16.848],
    ]),
    distance: 200,
    color: 'yellow',
    opacity: 50,
    ...overrides,
  } as unknown as FirecallItem;
}

// ==================== CSV TESTS ====================

describe('exportLayerItemsToCsv', () => {
  it('returns empty string for empty array', () => {
    const csv = exportLayerItemsToCsv([]);
    expect(csv).toBe('');
  });

  it('produces BOM + header + data row for a simple marker', () => {
    const csv = exportLayerItemsToCsv([makeMarker()]);
    // UTF-8 BOM
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    const lines = csv.slice(1).split('\n');
    expect(lines.length).toBeGreaterThanOrEqual(2); // header + at least 1 row

    const header = lines[0];
    // Base columns always present
    expect(header).toContain('name');
    expect(header).toContain('type');
    expect(header).toContain('lat');
    expect(header).toContain('lng');
    expect(header).toContain('alt');
    expect(header).toContain('beschreibung');
    expect(header).toContain('datum');

    // Data row
    const row = lines[1];
    expect(row).toContain('Test Marker');
    expect(row).toContain('marker');
    expect(row).toContain('47.948');
    expect(row).toContain('16.848');
    expect(row).toContain('120');
  });

  it('uses semicolon as separator', () => {
    const csv = exportLayerItemsToCsv([makeMarker()]);
    const lines = csv.slice(1).split('\n');
    // header should have semicolons
    expect(lines[0].split(';').length).toBeGreaterThan(1);
  });

  it('includes type-specific fields for vehicles', () => {
    const csv = exportLayerItemsToCsv([makeVehicle()]);
    const lines = csv.slice(1).split('\n');
    const header = lines[0];
    expect(header).toContain('fw');
    expect(header).toContain('besatzung');
    expect(header).toContain('ats');
    expect(header).toContain('alarmierung');
    expect(header).toContain('eintreffen');
    // abruecken is empty string so it's excluded from export

    const row = lines[1];
    expect(row).toContain('FF Neusiedl');
    expect(row).toContain('6'); // besatzung
  });

  it('includes type-specific fields for hydrants', () => {
    const csv = exportLayerItemsToCsv([makeHydrant()]);
    const lines = csv.slice(1).split('\n');
    const header = lines[0];
    expect(header).toContain('ortschaft');
    expect(header).toContain('typ');
    expect(header).toContain('hydranten_nummer');
  });

  it('includes fieldData columns with prefix', () => {
    const item = makeMarker({
      fieldData: { temperature: 25, status: 'active' },
    });
    const csv = exportLayerItemsToCsv([item]);
    const lines = csv.slice(1).split('\n');
    const header = lines[0];
    expect(header).toContain('fieldData.temperature');
    expect(header).toContain('fieldData.status');

    const row = lines[1];
    expect(row).toContain('25');
    expect(row).toContain('active');
  });

  it('escapes values containing semicolons', () => {
    const item = makeMarker({ beschreibung: 'first;second' });
    const csv = exportLayerItemsToCsv([item]);
    const lines = csv.slice(1).split('\n');
    const row = lines[1];
    // Semicolon in value should be quoted
    expect(row).toContain('"first;second"');
  });

  it('escapes values containing double quotes', () => {
    const item = makeMarker({ beschreibung: 'say "hello"' });
    const csv = exportLayerItemsToCsv([item]);
    const lines = csv.slice(1).split('\n');
    const row = lines[1];
    // Quotes should be escaped as ""
    expect(row).toContain('"say ""hello"""');
  });

  it('escapes values containing newlines', () => {
    const item = makeMarker({ beschreibung: 'line1\nline2' });
    const csv = exportLayerItemsToCsv([item]);
    // The raw value should be quoted
    expect(csv).toContain('"line1\nline2"');
  });

  it('includes positions, destLat, destLng for multipoint items', () => {
    const csv = exportLayerItemsToCsv([makeLine()]);
    const lines = csv.slice(1).split('\n');
    const header = lines[0];
    expect(header).toContain('positions');
    expect(header).toContain('destLat');
    expect(header).toContain('destLng');
  });

  it('skips internal fields like id, original, deleted, etc.', () => {
    const csv = exportLayerItemsToCsv([makeMarker()]);
    const lines = csv.slice(1).split('\n');
    const header = lines[0];
    const cols = header.split(';');
    expect(cols).not.toContain('id');
    expect(cols).not.toContain('original');
    expect(cols).not.toContain('deleted');
    expect(cols).not.toContain('editable');
    expect(cols).not.toContain('draggable');
    expect(cols).not.toContain('eventHandlers');
    expect(cols).not.toContain('layer');
    expect(cols).not.toContain('zIndex');
    expect(cols).not.toContain('rotation');
    expect(cols).not.toContain('creator');
    expect(cols).not.toContain('created');
    expect(cols).not.toContain('updatedAt');
    expect(cols).not.toContain('updatedBy');
    expect(cols).not.toContain('fieldData');
    expect(cols).not.toContain('attachments');
  });

  it('handles mixed item types, union of all columns', () => {
    const csv = exportLayerItemsToCsv([makeMarker(), makeVehicle()]);
    const lines = csv.slice(1).split('\n');
    const header = lines[0];
    // Should have vehicle-specific columns even though marker doesn't have them
    expect(header).toContain('fw');
    // Both rows present
    expect(lines.length).toBeGreaterThanOrEqual(3); // header + 2 data rows
  });
});

// ==================== GPX TESTS ====================

describe('exportLayerItemsToGpx', () => {
  it('returns empty GPX document for empty array', () => {
    const gpx = exportLayerItemsToGpx([],  'Testebene');
    expect(gpx).toContain('<?xml');
    expect(gpx).toContain('<gpx');
    expect(gpx).toContain('</gpx>');
    expect(gpx).not.toContain('<wpt');
    expect(gpx).not.toContain('<trk');
  });

  it('generates waypoint for point item', () => {
    const gpx = exportLayerItemsToGpx([makeMarker()],  'Testebene');
    expect(gpx).toContain('<wpt');
    expect(gpx).toContain('lat="47.948"');
    expect(gpx).toContain('lon="16.848"');
    expect(gpx).toContain('<name>Test Marker</name>');
    expect(gpx).toContain('<ele>120</ele>');
    expect(gpx).toContain('<desc>A test marker</desc>');
    expect(gpx).toContain('<time>2025-06-15T10:00:00Z</time>');
    expect(gpx).toContain('</wpt>');
  });

  it('generates track for line item', () => {
    const gpx = exportLayerItemsToGpx([makeLine()],  'Testebene');
    expect(gpx).toContain('<trk>');
    expect(gpx).toContain('<name>Test Line</name>');
    expect(gpx).toContain('<trkseg>');
    expect(gpx).toContain('<trkpt');
    // Check coordinates of track points
    expect(gpx).toContain('lat="47.948"');
    expect(gpx).toContain('lon="16.848"');
    expect(gpx).toContain('lat="47.949"');
    expect(gpx).toContain('lon="16.85"');
    expect(gpx).toContain('lat="47.95"');
    expect(gpx).toContain('lon="16.86"');
    expect(gpx).toContain('</trkseg>');
    expect(gpx).toContain('</trk>');
  });

  it('generates track for connection item', () => {
    const gpx = exportLayerItemsToGpx([makeConnection()],  'Testebene');
    expect(gpx).toContain('<trk>');
    expect(gpx).toContain('<name>Connection 1</name>');
  });

  it('generates track for area item', () => {
    const gpx = exportLayerItemsToGpx([makeArea()],  'Testebene');
    expect(gpx).toContain('<trk>');
    expect(gpx).toContain('<name>Test Area</name>');
  });

  it('includes type-specific fields in extensions', () => {
    const gpx = exportLayerItemsToGpx([makeVehicle()],  'Testebene');
    expect(gpx).toContain('<extensions>');
    expect(gpx).toContain('<fw>FF Neusiedl</fw>');
    expect(gpx).toContain('<besatzung>6</besatzung>');
    expect(gpx).toContain('<ats>2</ats>');
    expect(gpx).toContain('</extensions>');
  });

  it('includes fieldData in extensions', () => {
    const item = makeMarker({
      fieldData: { temperature: 25 },
    });
    const gpx = exportLayerItemsToGpx([item],  'Testebene');
    expect(gpx).toContain('<extensions>');
    expect(gpx).toContain('<fieldData.temperature>25</fieldData.temperature>');
    expect(gpx).toContain('</extensions>');
  });

  it('escapes XML entities in text content', () => {
    const item = makeMarker({ name: 'A & B <test>', beschreibung: '"quoted"' });
    const gpx = exportLayerItemsToGpx([item],  'Testebene');
    expect(gpx).toContain('<name>A &amp; B &lt;test&gt;</name>');
    expect(gpx).toContain('<desc>&quot;quoted&quot;</desc>');
  });

  it('falls back to start+end points when positions is missing for multipoint', () => {
    const item = makeLine({ positions: undefined });
    const gpx = exportLayerItemsToGpx([item],  'Testebene');
    expect(gpx).toContain('<trk>');
    // Should use lat/lng as start, destLat/destLng as end
    expect(gpx).toContain('lat="47.948"');
    expect(gpx).toContain('lon="16.848"');
    expect(gpx).toContain('lat="47.95"');
    expect(gpx).toContain('lon="16.86"');
  });

  it('contains valid GPX 1.1 header', () => {
    const gpx = exportLayerItemsToGpx([],  'Testebene');
    expect(gpx).toContain('version="1.1"');
    expect(gpx).toContain('xmlns="http://www.topografix.com/GPX/1/1"');
  });
});

// ==================== KML TESTS ====================

describe('exportLayerItemsToKml', () => {
  it('returns empty KML document for empty array', () => {
    const kml = exportLayerItemsToKml([], 'Testebene');
    expect(kml).toContain('<?xml');
    expect(kml).toContain('<kml');
    expect(kml).toContain('</kml>');
    expect(kml).not.toContain('<Placemark');
  });

  it('generates Point placemark for point item', () => {
    const kml = exportLayerItemsToKml([makeMarker()], 'Testebene');
    expect(kml).toContain('<Placemark>');
    expect(kml).toContain('<name>Test Marker</name>');
    expect(kml).toContain('<description>A test marker</description>');
    expect(kml).toContain('<Point>');
    // KML: lng,lat,alt (longitude first!)
    expect(kml).toContain('<coordinates>16.848,47.948,120</coordinates>');
    expect(kml).toContain('</Point>');
    expect(kml).toContain('</Placemark>');
  });

  it('generates LineString for line item', () => {
    const kml = exportLayerItemsToKml([makeLine()], 'Testebene');
    expect(kml).toContain('<LineString>');
    expect(kml).toContain('<coordinates>');
    // Check lng,lat order for line points
    expect(kml).toContain('16.848,47.948');
    expect(kml).toContain('16.85,47.949');
    expect(kml).toContain('16.86,47.95');
    expect(kml).toContain('</coordinates>');
    expect(kml).toContain('</LineString>');
  });

  it('generates LineString for connection item', () => {
    const kml = exportLayerItemsToKml([makeConnection()], 'Testebene');
    expect(kml).toContain('<LineString>');
  });

  it('generates Polygon for area item', () => {
    const kml = exportLayerItemsToKml([makeArea()], 'Testebene');
    expect(kml).toContain('<Polygon>');
    expect(kml).toContain('<outerBoundaryIs>');
    expect(kml).toContain('<LinearRing>');
    expect(kml).toContain('<coordinates>');
    // Should have a closed ring
    const kmlContent = kml;
    const coordsMatch = kmlContent.match(
      /<coordinates>([\s\S]*?)<\/coordinates>/,
    );
    expect(coordsMatch).toBeTruthy();
    const coords = coordsMatch![1].trim().split(/\s+/);
    // Last point should equal first point (closed ring)
    expect(coords[coords.length - 1]).toBe(coords[0]);
    expect(kml).toContain('</LinearRing>');
    expect(kml).toContain('</outerBoundaryIs>');
    expect(kml).toContain('</Polygon>');
  });

  it('includes ExtendedData for type-specific fields', () => {
    const kml = exportLayerItemsToKml([makeVehicle()], 'Testebene');
    expect(kml).toContain('<ExtendedData>');
    expect(kml).toContain('<Data name="fw">');
    expect(kml).toContain('<value>FF Neusiedl</value>');
    expect(kml).toContain('<Data name="besatzung">');
    expect(kml).toContain('<value>6</value>');
    expect(kml).toContain('</ExtendedData>');
  });

  it('includes fieldData in ExtendedData', () => {
    const item = makeMarker({
      fieldData: { temperature: 25 },
    });
    const kml = exportLayerItemsToKml([item], 'Testebene');
    expect(kml).toContain('<Data name="fieldData.temperature">');
    expect(kml).toContain('<value>25</value>');
  });

  it('escapes XML entities', () => {
    const item = makeMarker({ name: 'A & B <test>' });
    const kml = exportLayerItemsToKml([item], 'Testebene');
    expect(kml).toContain('<name>A &amp; B &lt;test&gt;</name>');
  });

  it('uses altitude 0 when alt is undefined', () => {
    const item = makeMarker({ alt: undefined });
    const kml = exportLayerItemsToKml([item], 'Testebene');
    expect(kml).toContain('<coordinates>16.848,47.948,0</coordinates>');
  });

  it('contains valid KML 2.2 header', () => {
    const kml = exportLayerItemsToKml([], 'Testebene');
    expect(kml).toContain('xmlns="http://www.opengis.net/kml/2.2"');
  });

  it('falls back to start+end for multipoint without positions', () => {
    const item = makeConnection({ positions: undefined });
    const kml = exportLayerItemsToKml([item], 'Testebene');
    expect(kml).toContain('<LineString>');
    // Should contain start and end coordinates
    expect(kml).toContain('16.848,47.948');
    expect(kml).toContain('16.86,47.95');
  });
});
