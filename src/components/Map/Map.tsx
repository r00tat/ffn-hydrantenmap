'use client';

import {
  LayersControl,
  MapContainer,
  TileLayer,
  useMap,
  WMSTileLayer,
} from 'react-leaflet';
import { defaultPosition } from '../../hooks/constants';
import Clusters from './Clusters';
import Leitungen from './Leitungen/Draw';
import { LeitungsProvider } from './Leitungen/context';
import MapActionButtons from './MapActionButtons';
import PositionAction from './PositionAction';
import UpdateMapPosition from './UpdateMapPosition';
import { DistanceLayer } from './layers/DistanceLayer';
import FirecallLayer from './layers/FirecallLayer';
import DistanceMarker from './markers/DistanceMarker';
import PositionMarker from './markers/PositionMarker';
import { availableLayers, overlayLayers } from './tiles';
import UnwetterLayer from './layers/UnwetterLayer';
import { useEffect } from 'react';
import L from 'leaflet';

function ActionButtons() {
  const map = useMap();
  return <MapActionButtons map={map} />;
}

export default function Map() {
  useEffect(() => {
    delete (L.Icon.Default.prototype as any)._getIconUrl;

    L.Icon.Default.mergeOptions({
      iconRetinaUrl: '/icons/leaflet/marker-icon-2x.png',
      iconUrl: '/icons/leaflet/marker-icon.png',
      shadowUrl: '/icons/leaflet/marker-shadow.png',
    });
  }, []);
  return (
    <MapContainer
      center={defaultPosition}
      zoom={17}
      maxZoom={24}
      scrollWheelZoom={true}
    >
      <LayersControl position="topright">
        {Object.entries(availableLayers).map(([key, layer], index) => (
          <LayersControl.BaseLayer
            checked={index == 0}
            name={layer.name}
            key={key}
          >
            <TileLayer
              attribution={layer.options.attribution}
              url={layer.url}
              maxZoom={layer.options.maxZoom}
              maxNativeZoom={layer.options.maxNativeZoom}
              bounds={layer.options.bounds}
              subdomains={layer.options.subdomains}
              key={key}
            />
          </LayersControl.BaseLayer>
        ))}

        <FirecallLayer />
        <LayersControl.Overlay name="Unwetter" checked>
          <UnwetterLayer />
        </LayersControl.Overlay>

        <LayersControl.Overlay name="Entfernung">
          <DistanceMarker />
        </LayersControl.Overlay>
        <Clusters />
        <LayersControl.Overlay name="Umkreis">
          <DistanceLayer />
        </LayersControl.Overlay>
        <LayersControl.Overlay name="Position" checked>
          <PositionMarker />
        </LayersControl.Overlay>
        {Object.entries(overlayLayers)
          .filter(([key, layer]) => (layer.type || 'WTMS') == 'WTMS')
          .map(([key, layer]) => (
            <LayersControl.Overlay
              name={layer.name}
              key={key}
              checked={layer.enabled}
            >
              <TileLayer
                attribution={layer.options.attribution}
                url={layer.url}
                maxZoom={layer.options.maxZoom}
                maxNativeZoom={layer.options.maxNativeZoom}
                bounds={layer.options.bounds}
                subdomains={layer.options.subdomains}
                key={key}
              />
            </LayersControl.Overlay>
          ))}
        {Object.entries(overlayLayers)
          .filter(([key, layer]) => layer.type == 'WMS')
          .map(([key, layer]) => (
            <LayersControl.Overlay name={layer.name} key={key}>
              <WMSTileLayer
                layers={layer.options.layers}
                attribution={layer.options.attribution}
                url={layer.url}
                maxZoom={layer.options.maxZoom}
                maxNativeZoom={layer.options.maxNativeZoom}
                bounds={layer.options.bounds}
                subdomains={layer.options.subdomains}
                key={key}
                format={layer.options.format}
                transparent={layer.options.transparent}
                tileSize={512}
                uppercase={layer.options.uppercase}
              />
            </LayersControl.Overlay>
          ))}
      </LayersControl>
      {/* <FullscreenControl /> */}
      <UpdateMapPosition />
      <LeitungsProvider>
        <ActionButtons />
        <Leitungen />
      </LeitungsProvider>
      <PositionAction />
    </MapContainer>
  );
}
