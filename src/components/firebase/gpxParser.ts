import { gpx as toGeoJSON } from '@mapbox/togeojson';
import {
  generateSchemaFromFeatures,
  GeoJsonFeatureCollection,
} from './geoJsonImport';
import { DataSchemaField } from './firestore';

export interface GpxPreviewState {
  geoJson: GeoJsonFeatureCollection;
  schema: DataSchemaField[];
  headerToSchemaKey: Map<string, string>;
  layerName: string;
}

export function parseGpxFile(
  gpxText: string,
  fileName: string
): GpxPreviewState {
  const dom = new DOMParser().parseFromString(gpxText, 'text/xml');
  const geoJson: GeoJsonFeatureCollection = toGeoJSON(dom);
  const { schema, headerToSchemaKey } = generateSchemaFromFeatures(
    geoJson.features
  );
  const layerName = fileName.replace(/\.gpx$/i, '');
  return { geoJson, schema, headerToSchemaKey, layerName };
}
