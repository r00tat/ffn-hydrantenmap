import { kml as toGeoJSON } from '@mapbox/togeojson';
import CloudUploadIcon from '@mui/icons-material/CloudUpload';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import Typography from '@mui/material/Typography';
import {
  FeatureCollection,
  Geometry,
  LineString,
  Point,
  Polygon,
} from 'geojson';
import { useCallback, useState } from 'react';
import { GeoPosition } from '../../common/geo';
import { formatTimestamp } from '../../common/time-format';
import useFirecallItemAdd from '../../hooks/useFirecallItemAdd';
import { FirecallArea } from '../FirecallItems/elements/FirecallArea';
import VisuallyHiddenInput from '../upload/VisuallyHiddenInput';
import readFileAsText from '../upload/readFile';
import { DataSchemaField, FcMarker, FirecallItem, Line } from './firestore';
import { coerceValue, inferType } from './importUtils';

export interface KmlGeoProperties {
  name: string;
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

export type GeoJsonFeatureColleaction = FeatureCollection<
  Geometry,
  KmlGeoProperties
>;

function kmlToGeoJson(kml: string) {
  var dom = new DOMParser().parseFromString(kml, 'text/xml');
  // console.info('dom', dom);
  const geoJson: GeoJsonFeatureColleaction = toGeoJSON(dom);
  geoJson.features.map((f) => {
    if (f.geometry.type === 'Point' && f.properties.styleUrl) {
      const styleElement = dom.querySelector(f.properties.styleUrl);
      f.properties.fill =
        styleElement?.querySelector('color')?.textContent ?? '#0000ff';
    }
    return f;
  });
  // console.info(`geojson\n${JSON.stringify(geoJson)}`);
  return geoJson;
}

const KML_STYLE_PROPERTIES = new Set([
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

function generateSchemaFromFeatures(
  features: GeoJsonFeatureColleaction['features']
): { schema: DataSchemaField[]; headerToSchemaKey: Map<string, string> } {
  const fieldMap = new Map<string, Set<DataSchemaField['type']>>();

  for (const feature of features) {
    for (const [key, value] of Object.entries(feature.properties)) {
      if (KML_STYLE_PROPERTIES.has(key.toLowerCase())) continue;
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

function parseGeoJson(
  geojson: GeoJsonFeatureColleaction,
  schema: DataSchemaField[],
  headerToSchemaKey: Map<string, string>
): FirecallItem[] {
  // Build reverse map: schemaKey → field (for type coercion)
  const schemaByKey = new Map(schema.map((f) => [f.key, f]));

  return geojson.features.map((f) => {
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
      name: `${f.properties.name}`,
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

export default function KmlImport() {
  const [uploadInProgress, setUploadInProgress] = useState(false);

  const addFirecallItem = useFirecallItemAdd();

  const handleUpload = useCallback(
    async (files: FileList): Promise<void> => {
      console.log(`kml import upload change `, files);

      if (files) {
        setUploadInProgress(true);

        const refs = await Promise.allSettled(
          Array.from(files).map(async (file) => {
            try {
              console.log(`uploading ${file.name}`);
              const kmlData = await readFileAsText(file);

              const geoJson = kmlToGeoJson(kmlData);

              const schema = generateSchemaFromFeatures(geoJson.features);

              const fcItems = parseGeoJson(geoJson, schema);

              // console.log(`importing Kml \n${JSON.stringify(fcItems)}`);

              const layer = await addFirecallItem({
                name: `KML Import ${formatTimestamp(new Date())}`,
                type: 'layer',
                dataSchema: schema,
              } as FirecallItem);
              await Promise.allSettled(
                fcItems
                  .map((i) => ({ ...i, layer: layer.id }))
                  .map(addFirecallItem)
              );

              // console.debug(`import finished with IDs: ${ref.id}`);
              // return ref;
            } catch (err) {
              console.error('failed to parse geojson', err);
            }
          })
        );
        // .filter((p) => p.status === 'fulfilled');
        // .map((p) => (p as PromiseFulfilledResult<StorageReference>).value);
        setUploadInProgress(false);
      }
    },
    [addFirecallItem]
  );

  return (
    <>
      <Button
        component="label"
        variant="contained"
        startIcon={<CloudUploadIcon />}
      >
        KML importieren
        <VisuallyHiddenInput
          type="file"
          accept=".kml,text/xml,application/vnd.google-earth.kml+xml"
          // multiple
          onChange={(event) => {
            (async () => {
              if (event.target.files) {
                await handleUpload(event.target.files);
                event.target.value = '';
              }
            })();
          }}
        />
      </Button>
      {uploadInProgress && (
        <>
          <Typography>Uploading ... </Typography>
          <CircularProgress />
        </>
      )}
    </>
  );
}
