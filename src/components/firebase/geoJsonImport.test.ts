import { describe, it, expect } from 'vitest';
import { generateSchemaFromFeatures, parseGeoJson, TYPE_LABELS } from './geoJsonImport';

const pointFeatures = {
  type: 'FeatureCollection' as const,
  features: [
    {
      type: 'Feature' as const,
      geometry: { type: 'Point' as const, coordinates: [16.848, 47.948, 5.36] },
      properties: { name: 'WP1', elevation: 123, fill: '#ff0000', styleUrl: '#style1' },
    },
    {
      type: 'Feature' as const,
      geometry: { type: 'Point' as const, coordinates: [16.849, 47.949, 10.2] },
      properties: { name: 'WP2', elevation: 456 },
    },
  ],
};

const lineFeatures = {
  type: 'FeatureCollection' as const,
  features: [
    {
      type: 'Feature' as const,
      geometry: {
        type: 'LineString' as const,
        coordinates: [
          [16.848, 47.948, 5],
          [16.849, 47.949, 10],
          [16.850, 47.950, 15],
        ],
      },
      properties: { name: 'Track 1' },
    },
  ],
};

describe('generateSchemaFromFeatures', () => {
  it('excludes style properties and name', () => {
    const { schema } = generateSchemaFromFeatures(pointFeatures.features);
    const keys = schema.map((s) => s.key);
    expect(keys).toContain('elevation');
    expect(keys).not.toContain('name');
    expect(keys).not.toContain('fill');
    expect(keys).not.toContain('styleUrl');
  });

  it('infers numeric type for number values', () => {
    const { schema } = generateSchemaFromFeatures(pointFeatures.features);
    const elevation = schema.find((s) => s.key === 'elevation');
    expect(elevation?.type).toBe('number');
  });

  it('returns headerToSchemaKey mapping', () => {
    const { headerToSchemaKey } = generateSchemaFromFeatures(pointFeatures.features);
    expect(headerToSchemaKey.get('elevation')).toBe('elevation');
  });
});

describe('parseGeoJson', () => {
  it('converts Point features to marker items', () => {
    const { schema, headerToSchemaKey } = generateSchemaFromFeatures(pointFeatures.features);
    const items = parseGeoJson(pointFeatures, schema, headerToSchemaKey);
    expect(items).toHaveLength(2);
    expect(items[0].type).toBe('marker');
    expect(items[0].name).toBe('WP1');
    expect(items[0].lat).toBeCloseTo(47.948);
    expect(items[0].lng).toBeCloseTo(16.848);
  });

  it('converts LineString features to line items', () => {
    const { schema, headerToSchemaKey } = generateSchemaFromFeatures(lineFeatures.features);
    const items = parseGeoJson(lineFeatures, schema, headerToSchemaKey);
    expect(items).toHaveLength(1);
    expect(items[0].type).toBe('line');
    expect(items[0].name).toBe('Track 1');
    expect((items[0] as any).positions).toBeDefined();
    expect((items[0] as any).destLat).toBeCloseTo(47.950);
    expect((items[0] as any).destLng).toBeCloseTo(16.850);
  });

  it('uses index-based name when name property is missing', () => {
    const noNameFeatures = {
      type: 'FeatureCollection' as const,
      features: [
        {
          type: 'Feature' as const,
          geometry: { type: 'Point' as const, coordinates: [16.848, 47.948] },
          properties: {},
        },
      ],
    };
    const { schema, headerToSchemaKey } = generateSchemaFromFeatures(noNameFeatures.features);
    const items = parseGeoJson(noNameFeatures, schema, headerToSchemaKey);
    expect(items[0].name).toBe('1');
  });
});

describe('TYPE_LABELS', () => {
  it('has labels for Point, LineString, Polygon', () => {
    expect(TYPE_LABELS.Point).toBe('Punkte');
    expect(TYPE_LABELS.LineString).toBe('Linien');
    expect(TYPE_LABELS.Polygon).toBe('Flächen');
  });
});
