'use client';

import { LayersControl, TileLayer, WMSTileLayer } from 'react-leaflet';
import { useFirecallMapLayers } from '../../../hooks/useFirecallMapLayers';
import {
  mapLayerConfigKey,
  mapLayerTileConfigs,
  type TileConfig,
} from '../tiles';
import LayerErrorBoundary from './LayerErrorBoundary';

/**
 * Ein transparentes Pixel. Leaflet zeigt sonst an jeder Kachel, die der fremde
 * Dienst nicht liefert, das Symbol für ein kaputtes Bild — die Karte wäre mit
 * Platzhaltern gepflastert, statt die Basiskarte durchscheinen zu lassen.
 */
const TRANSPARENT_TILE =
  'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';

/**
 * Eigene Kartenebenen liegen über den eingebauten Kacheln: `zIndex` startet
 * oberhalb dessen, was Leaflet den Basis- und Überlagerungsebenen im
 * `tilePane` vergibt.
 */
const BASE_Z_INDEX = 300;

function CustomMapLayer({
  config,
  rank,
}: {
  config: TileConfig;
  rank: number;
}) {
  const { options } = config;
  const zIndex = BASE_Z_INDEX + rank;

  if (config.type === 'WMS') {
    return (
      <WMSTileLayer
        url={config.url}
        layers={options.layers}
        format={options.format}
        transparent={options.transparent}
        uppercase
        tileSize={512}
        opacity={options.opacity}
        maxZoom={options.maxZoom}
        maxNativeZoom={options.maxNativeZoom}
        bounds={options.bounds}
        attribution={options.attribution}
        errorTileUrl={TRANSPARENT_TILE}
        zIndex={zIndex}
      />
    );
  }

  return (
    <TileLayer
      url={config.url}
      opacity={options.opacity}
      maxZoom={options.maxZoom}
      maxNativeZoom={options.maxNativeZoom}
      bounds={options.bounds}
      attribution={options.attribution}
      errorTileUrl={TRANSPARENT_TILE}
      zIndex={zIndex}
    />
  );
}

/**
 * Die eigenen Kartenebenen des Einsatzes als Einträge im Layer-Control.
 *
 * Muss innerhalb von `<LayersControl>` stehen — `LayersControl.Overlay` findet
 * die Steuerung über den React-Kontext, die Verschachtelung ist also egal.
 *
 * Ungültige Ebenen fallen in `mapLayerTileConfigs` heraus: ein Dokument kann
 * über den Import eines Einsatzes hereingekommen sein und muss die Prüfung aus
 * dem Dialog nicht durchlaufen haben; die Karte darf keine Adresse anfragen,
 * die sie nicht selbst geprüft hat. Was trotzdem beim Rendern scheitert, fängt
 * die Fehlergrenze je Ebene ab — die übrigen Ebenen und die Karte bleiben
 * stehen.
 */
export default function CustomMapLayers() {
  const configs = mapLayerTileConfigs(useFirecallMapLayers());

  return (
    <>
      {configs.map((config, index) => (
        <LayersControl.Overlay
          key={mapLayerConfigKey(config)}
          name={config.name}
          checked={config.enabled === true}
        >
          <LayerErrorBoundary name={config.name}>
            <CustomMapLayer config={config} rank={index} />
          </LayerErrorBoundary>
        </LayersControl.Overlay>
      ))}
    </>
  );
}
