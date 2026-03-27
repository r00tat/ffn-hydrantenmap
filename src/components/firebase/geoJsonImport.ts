import {
  FeatureCollection,
  Geometry,
  LineString,
  Point,
  Polygon,
} from 'geojson';
import { GeoPosition } from '../../common/geo';
import { DataSchemaField, FcMarker, FirecallItem, Line } from './firestore';
import { FirecallArea } from '../FirecallItems/elements/FirecallArea';
import { coerceValue, inferType } from './importUtils';

export interface KmlGeoProperties {
  name?: string;
  styleUrl?: string;
  styleHash?: string;
  stroke?: string;
  'stroke-opacity'?: number;
  'stroke-width'?: number;
  fill?: string;
  'fill-opacity'?: number;
  visibility?: string;
  [key: string]: any;
}

export type GeoJsonFeatureCollection = FeatureCollection<
  Geometry,
  KmlGeoProperties
>;

export const TYPE_LABELS: Record<string, string> = {
  Point: 'Punkte',
  LineString: 'Linien',
  Polygon: 'Flächen',
};

export const STYLE_PROPERTIES = new Set([
  'styleurl',
  'stylehash',
  'stroke',
  'stroke-opacity',
  'stroke-width',
  'fill',
  'fill-opacity',
  'visibility',
  'icon',
  'name',
]);

export function generateSchemaFromFeatures(
  features: GeoJsonFeatureCollection['features']
): { schema: DataSchemaField[]; headerToSchemaKey: Map<string, string> } {
  const fieldMap = new Map<string, Set<DataSchemaField['type']>>();

  for (const feature of features) {
    for (const [key, value] of Object.entries(feature.properties)) {
      if (STYLE_PROPERTIES.has(key.toLowerCase())) continue;
      if (value === undefined || value === null) continue;
      if (!fieldMap.has(key)) fieldMap.set(key, new Set());
      fieldMap.get(key)!.add(inferType(value));
    }
  }

  const schema: DataSchemaField[] = Array.from(fieldMap.entries()).map(
    ([key, types]) => ({
      key,
      label: key,
      unit: '',
      type: types.size === 1 ? types.values().next().value! : 'text',
    })
  );

  const headerToSchemaKey = new Map<string, string>(
    schema.map((f) => [f.key, f.key])
  );

  return { schema, headerToSchemaKey };
}

export function parseGeoJson(
  geojson: GeoJsonFeatureCollection,
  schema: DataSchemaField[],
  headerToSchemaKey: Map<string, string>
): FirecallItem[] {
  // Build reverse map: schemaKey -> field (for type coercion)
  const schemaByKey = new Map(schema.map((f) => [f.key, f]));

  return geojson.features.map((f, index) => {
    const latlng = GeoPosition.fromGeoJsonPosition(
      f.geometry.type === 'Point'
        ? (f.geometry as Point).coordinates
        : (f.geometry as LineString).coordinates[0]
    );

    const fieldData: Record<string, string | number | boolean> = {};
    for (const [originalKey, schemaKey] of headerToSchemaKey.entries()) {
      const value = f.properties[originalKey];
      const field = schemaByKey.get(schemaKey);
      if (value !== undefined && value !== null && field) {
        fieldData[schemaKey] = coerceValue(value, field.type);
      }
    }

    const item: FirecallItem = {
      type: 'marker',
      name: f.properties.name || `${index + 1}`,
      datum: new Date(
        f.properties['Time Stamp'] ??
          f.properties['timestamp'] ??
          new Date().toISOString()
      ).toISOString(),
      lat: latlng.lat,
      lng: latlng.lng,
      alt: latlng.alt,
      fieldData,
    };

    if (f.geometry.type === 'Point') {
      (item as FcMarker).color = f.properties.fill;
      (item as FcMarker).iconUrl = f.properties.icon;
    } else if (f.geometry.type === 'LineString') {
      item.type = 'line';
      const lineString = f.geometry as LineString;
      (item as Line).positions = JSON.stringify(
        lineString.coordinates.map((c) =>
          GeoPosition.fromGeoJsonPosition(c).toLatLngPosition()
        )
      );
      const dest = GeoPosition.fromGeoJsonPosition(
        lineString.coordinates[lineString.coordinates.length - 1]
      );
      (item as Line).destLat = dest.lat;
      (item as Line).destLng = dest.lng;
      (item as Line).opacity = f.properties['fill-opacity']
        ? Math.round(f.properties['fill-opacity'] * 100)
        : 50;
      (item as Line).color = f.properties.fill;
    } else if (f.geometry.type === 'Polygon') {
      const polygon = f.geometry as Polygon;
      item.type = 'area';
      (item as FirecallArea).positions = JSON.stringify(
        polygon.coordinates[0].map((c) =>
          GeoPosition.fromGeoJsonPosition(c).toLatLngPosition()
        )
      );
      const dest = GeoPosition.fromGeoJsonPosition(
        polygon.coordinates[0][polygon.coordinates[0].length - 1]
      );
      (item as Line).destLat = dest.lat;
      (item as Line).destLng = dest.lng;
      (item as Line).opacity = f.properties['fill-opacity']
        ? Math.round(f.properties['fill-opacity'] * 100)
        : 50;
      (item as Line).color = f.properties.fill;
    }

    return item;
  });
}
