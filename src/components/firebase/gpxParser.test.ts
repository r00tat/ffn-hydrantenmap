// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { parseGpxFile, explodeTracksToPoints } from './gpxParser';

const SIMPLE_GPX = `<?xml version="1.0" encoding="utf-8"?>
<gpx version="1.1" xmlns="http://www.topografix.com/GPX/1/1">
<trk>
<name>Test Track</name>
<trkseg>
<trkpt lat="47.948" lon="16.848"><ele>5.36</ele><time>2026-03-27T07:48:09Z</time></trkpt>
<trkpt lat="47.949" lon="16.849"><ele>10.2</ele><time>2026-03-27T07:48:10Z</time></trkpt>
</trkseg>
</trk>
<wpt lat="47.950" lon="16.850"><name>Waypoint 1</name><ele>100</ele></wpt>
<rte>
<name>Test Route</name>
<rtept lat="47.951" lon="16.851"><ele>50</ele></rtept>
<rtept lat="47.952" lon="16.852"><ele>60</ele></rtept>
</rte>
</gpx>`;

describe('parseGpxFile', () => {
  it('parses tracks as LineString features', () => {
    const result = parseGpxFile(SIMPLE_GPX, 'test.gpx');
    const lines = result.geoJson.features.filter(
      (f) => f.geometry.type === 'LineString'
    );
    expect(lines.length).toBeGreaterThanOrEqual(1);
    const track = lines.find((f) => f.properties.name === 'Test Track');
    expect(track).toBeDefined();
  });

  it('parses waypoints as Point features', () => {
    const result = parseGpxFile(SIMPLE_GPX, 'test.gpx');
    const points = result.geoJson.features.filter(
      (f) => f.geometry.type === 'Point'
    );
    expect(points.length).toBeGreaterThanOrEqual(1);
    const wp = points.find((f) => f.properties.name === 'Waypoint 1');
    expect(wp).toBeDefined();
  });

  it('parses routes as LineString features', () => {
    const result = parseGpxFile(SIMPLE_GPX, 'test.gpx');
    const lines = result.geoJson.features.filter(
      (f) => f.geometry.type === 'LineString'
    );
    const route = lines.find((f) => f.properties.name === 'Test Route');
    expect(route).toBeDefined();
  });

  it('derives layer name from filename', () => {
    const result = parseGpxFile(SIMPLE_GPX, 'RadiaCode_Track.gpx');
    expect(result.layerName).toBe('RadiaCode_Track');
  });

  it('generates schema from feature properties', () => {
    const result = parseGpxFile(SIMPLE_GPX, 'test.gpx');
    expect(result.schema).toBeDefined();
    expect(result.headerToSchemaKey).toBeDefined();
  });
});

describe('explodeTracksToPoints', () => {
  it('converts LineString track to individual Point features', () => {
    const result = parseGpxFile(SIMPLE_GPX, 'test.gpx');
    const exploded = explodeTracksToPoints(result.geoJson);
    const points = exploded.features.filter((f) => f.geometry.type === 'Point');
    // 2 trackpoints + 1 waypoint + 2 route points = 5
    expect(points.length).toBeGreaterThanOrEqual(2);
    // Track points should have elevation from coordinates
    const trackPoints = points.filter(
      (f) => f.properties.name?.startsWith('Test Track')
    );
    expect(trackPoints).toHaveLength(2);
  });

  it('preserves coordTimes as time property on each point', () => {
    const result = parseGpxFile(SIMPLE_GPX, 'test.gpx');
    const exploded = explodeTracksToPoints(result.geoJson);
    const trackPoints = exploded.features.filter(
      (f) =>
        f.geometry.type === 'Point' &&
        f.properties.name?.startsWith('Test Track')
    );
    expect(trackPoints[0].properties.time).toBe('2026-03-27T07:48:09Z');
    expect(trackPoints[1].properties.time).toBe('2026-03-27T07:48:10Z');
  });

  it('preserves elevation in coordinates', () => {
    const result = parseGpxFile(SIMPLE_GPX, 'test.gpx');
    const exploded = explodeTracksToPoints(result.geoJson);
    const trackPoints = exploded.features.filter(
      (f) =>
        f.geometry.type === 'Point' &&
        f.properties.name?.startsWith('Test Track')
    );
    // coordinates are [lon, lat, ele]
    expect((trackPoints[0].geometry as any).coordinates[2]).toBeCloseTo(5.36);
    expect((trackPoints[1].geometry as any).coordinates[2]).toBeCloseTo(10.2);
  });

  it('keeps existing waypoints unchanged', () => {
    const result = parseGpxFile(SIMPLE_GPX, 'test.gpx');
    const exploded = explodeTracksToPoints(result.geoJson);
    const wp = exploded.features.find(
      (f) => f.properties.name === 'Waypoint 1'
    );
    expect(wp).toBeDefined();
    expect(wp!.geometry.type).toBe('Point');
  });

  it('names points with track name and index', () => {
    const result = parseGpxFile(SIMPLE_GPX, 'test.gpx');
    const exploded = explodeTracksToPoints(result.geoJson);
    const trackPoints = exploded.features.filter(
      (f) =>
        f.geometry.type === 'Point' &&
        f.properties.name?.startsWith('Test Track')
    );
    expect(trackPoints[0].properties.name).toBe('Test Track 1');
    expect(trackPoints[1].properties.name).toBe('Test Track 2');
  });
});
