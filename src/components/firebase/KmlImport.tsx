import CloudUploadIcon from '@mui/icons-material/CloudUpload';
import { CircularProgress, Typography } from '@mui/material';
import Button from '@mui/material/Button';
import { useCallback, useState } from 'react';
import VisuallyHiddenInput from '../upload/VisuallyHiddenInput';
import readFileAsText from '../upload/readFile';
import { kml as toGeoJSON } from '@mapbox/togeojson';
import {
  Feature,
  FeatureCollection,
  Geometry,
  LineString,
  Point,
  Polygon,
} from 'geojson';

import { FirecallItem, FirecallLayer, Line } from './firestore';
import { GeoPosition } from '../../common/geo';
import { FirecallArea } from '../FirecallItems/elements/FirecallArea';
import useFirecallItemAdd from '../../hooks/useFirecallItemAdd';
import { formatTimestamp } from '../../common/time-format';

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
}

export type GeoJsonFeatureColleaction = FeatureCollection<
  Geometry,
  KmlGeoProperties
>;

function kmlToGeoJson(kml: string) {
  var dom = new DOMParser().parseFromString(kml, 'text/xml');
  return toGeoJSON(dom);
}

function parseGeoJson(geojson: GeoJsonFeatureColleaction): FirecallItem[] {
  return geojson.features.map((f) => {
    const latlng = GeoPosition.fromGeoJsonPosition(
      f.geometry.type === 'Point'
        ? (f.geometry as Point).coordinates
        : (f.geometry as LineString).coordinates[0]
    );
    const item: FirecallItem = {
      type: 'marker',
      name: `${f.properties.name}`,
      lat: latlng.lat,
      lng: latlng.lng,
      alt: latlng.alt,
    };

    if (f.geometry.type === 'LineString') {
      // line
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

              const fcItems = parseGeoJson(geoJson);

              console.log(`importing Kml \n${JSON.stringify(fcItems)}`);

              const layer = await addFirecallItem({
                name: `KML Import ${formatTimestamp(new Date())}`,
                type: 'layer',
              } as FirecallItem);
              await Promise.allSettled(
                fcItems
                  .map((i) => ({ ...i, layer: layer.id }))
                  .map(addFirecallItem)
              );

              // const ref = await importFirecall({
              //   ...firecallData,
              //   name: `${firecallData.name} Kopie ${formatTimestamp(new Date())}`,
              // });

              // console.debug(`import finished with ID: ${ref.id}`);
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
