import { kml as toGeoJSON } from '@mapbox/togeojson';
import CloudUploadIcon from '@mui/icons-material/CloudUpload';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import CircularProgress from '@mui/material/CircularProgress';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import DataSchemaEditor from '../FirecallItems/DataSchemaEditor';
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

const TYPE_LABELS: Record<string, string> = {
  Point: 'Punkte',
  LineString: 'Linien',
  Polygon: 'Flächen',
};

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

interface KmlPreviewState {
  geoJson: GeoJsonFeatureColleaction;
  schema: DataSchemaField[];
  headerToSchemaKey: Map<string, string>;
  layerName: string;
}

function parseKmlFile(kmlText: string, fileName: string): KmlPreviewState {
  const geoJson = kmlToGeoJson(kmlText);
  const { schema, headerToSchemaKey } = generateSchemaFromFeatures(
    geoJson.features
  );
  const layerName = fileName.replace(/\.kml$/i, '');
  return { geoJson, schema, headerToSchemaKey, layerName };
}

export default function KmlImport() {
  const [uploadInProgress, setUploadInProgress] = useState(false);
  const [parsing, setParsing] = useState(false);
  const [preview, setPreview] = useState<KmlPreviewState | null>(null);
  const addFirecallItem = useFirecallItemAdd();

  const handleFileSelect = useCallback(async (files: FileList) => {
    if (!files || files.length === 0) return;
    const file = files[0];
    setParsing(true);
    try {
      const kmlText = await readFileAsText(file);
      setPreview(parseKmlFile(kmlText, file.name));
    } finally {
      setParsing(false);
    }
  }, []);

  const handleSchemaChange = useCallback(
    (newSchema: DataSchemaField[]) => {
      if (!preview) return;
      const oldSchema = preview.schema;
      const newHeaderToSchemaKey = new Map<string, string>();

      for (const [origKey, oldSchemaKey] of preview.headerToSchemaKey.entries()) {
        const oldIdx = oldSchema.findIndex((f) => f.key === oldSchemaKey);
        if (oldIdx < 0) continue; // shouldn't happen

        if (oldIdx < newSchema.length) {
          // Same position exists in new schema — could be a rename or unchanged
          // Only use positional mapping if schemas are the same length (rename, not delete)
          // If lengths differ (deletion happened), only keep if the key still exists
          if (oldSchema.length === newSchema.length) {
            // Rename case: map to new key at same position
            newHeaderToSchemaKey.set(origKey, newSchema[oldIdx].key);
          } else if (newSchema.some((f) => f.key === oldSchemaKey)) {
            // Deletion case: key still exists somewhere, keep it
            newHeaderToSchemaKey.set(origKey, oldSchemaKey);
          }
          // else: field was deleted, drop the entry
        }
        // else: index out of bounds = field was deleted, drop the entry
      }

      setPreview({
        ...preview,
        schema: newSchema,
        headerToSchemaKey: newHeaderToSchemaKey,
      });
    },
    [preview]
  );

  const handleImport = useCallback(async () => {
    if (!preview) return;
    setPreview(null);
    setUploadInProgress(true);

    try {
      const { geoJson, schema, headerToSchemaKey, layerName } = preview;
      const fcItems = parseGeoJson(geoJson, schema, headerToSchemaKey);

      const layer = await addFirecallItem({
        name: layerName || `KML Import ${formatTimestamp(new Date())}`,
        type: 'layer',
        dataSchema: schema,
      } as FirecallItem);

      await Promise.allSettled(
        fcItems.map((i) => ({ ...i, layer: layer.id })).map(addFirecallItem)
      );
    } catch (err) {
      console.error('Failed to import KML', err);
    }

    setUploadInProgress(false);
  }, [preview, addFirecallItem]);

  // Compute per-type counts from features
  const typeCounts = preview
    ? preview.geoJson.features.reduce(
        (acc, f) => {
          const t = f.geometry.type;
          acc[t] = (acc[t] ?? 0) + 1;
          return acc;
        },
        {} as Record<string, number>
      )
    : {};

  const totalCount = Object.values(typeCounts).reduce((a, b) => a + b, 0);

  return (
    <>
      <Button
        component="label"
        variant="contained"
        startIcon={parsing ? undefined : <CloudUploadIcon />}
        endIcon={parsing ? <CircularProgress size={16} color="inherit" /> : undefined}
        disabled={parsing}
      >
        KML importieren
        <VisuallyHiddenInput
          type="file"
          accept=".kml,text/xml,application/vnd.google-earth.kml+xml"
          onChange={(event) => {
            (async () => {
              if (event.target.files) {
                await handleFileSelect(event.target.files);
                event.target.value = '';
              }
            })();
          }}
        />
      </Button>
      {uploadInProgress && (
        <>
          <Typography component="span" sx={{ ml: 1 }}>
            Importiere...
          </Typography>
          <CircularProgress size={20} sx={{ ml: 1 }} />
        </>
      )}
      {preview && (
        <Dialog
          open
          onClose={() => setPreview(null)}
          maxWidth="sm"
          fullWidth
        >
          <DialogTitle>KML Import</DialogTitle>
          <DialogContent>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
              <TextField
                label="Ebenenname"
                size="small"
                fullWidth
                value={preview.layerName}
                onChange={(e) =>
                  setPreview({ ...preview, layerName: e.target.value })
                }
              />

              <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                {Object.entries(typeCounts).map(([type, count]) => (
                  <Chip
                    key={type}
                    label={`${count} ${TYPE_LABELS[type] ?? type}`}
                    size="small"
                  />
                ))}
              </Box>

              <DataSchemaEditor
                dataSchema={preview.schema}
                onChange={handleSchemaChange}
              />
            </Box>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setPreview(null)}>Abbrechen</Button>
            <Button
              variant="contained"
              onClick={handleImport}
              disabled={totalCount === 0}
            >
              {totalCount} Objekte importieren
            </Button>
          </DialogActions>
        </Dialog>
      )}
    </>
  );
}
