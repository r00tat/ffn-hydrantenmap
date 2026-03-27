import { gpx as toGeoJSON } from '@mapbox/togeojson';
import { Feature, LineString, Point } from 'geojson';
import {
  generateSchemaFromFeatures,
  GeoJsonFeatureCollection,
  KmlGeoProperties,
} from './geoJsonImport';
import { DataSchemaField } from './firestore';

export interface GpxPreviewState {
  geoJson: GeoJsonFeatureCollection;
  schema: DataSchemaField[];
  headerToSchemaKey: Map<string, string>;
  layerName: string;
}

/**
 * Explode LineString features (tracks/routes) into individual Point features,
 * preserving per-point attributes (time, elevation). Non-LineString features
 * (waypoints) are kept as-is.
 */
export function explodeTracksToPoints(
  geoJson: GeoJsonFeatureCollection
): GeoJsonFeatureCollection {
  const features: Feature<Point | LineString, KmlGeoProperties>[] = [];

  for (const feature of geoJson.features) {
    if (feature.geometry.type === 'LineString') {
      const line = feature.geometry as LineString;
      const coordTimes: string[] | undefined =
        feature.properties.coordTimes as string[] | undefined;
      const trackName = feature.properties.name || 'Track';

      for (let i = 0; i < line.coordinates.length; i++) {
        const coord = line.coordinates[i];
        const time = coordTimes?.[i];
        const props: KmlGeoProperties = {
          ...feature.properties,
          name: `${trackName} ${i + 1}`,
        };
        if (time) {
          props.time = time;
        }
        // Remove array-level coordTimes from individual points
        delete props.coordTimes;

        features.push({
          type: 'Feature',
          geometry: {
            type: 'Point',
            coordinates: coord,
          },
          properties: props,
        });
      }
    } else {
      features.push(feature as Feature<Point | LineString, KmlGeoProperties>);
    }
  }

  return { type: 'FeatureCollection', features } as GeoJsonFeatureCollection;
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
