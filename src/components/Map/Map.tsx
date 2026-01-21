'use client';

import Box from '@mui/material/Box';
import { styled } from '@mui/material/styles';
import L from 'leaflet';
import { useEffect } from 'react';
import {
  LayersControl,
  MapContainer,
  TileLayer,
  useMap,
  WMSTileLayer,
} from 'react-leaflet';
import { defaultPosition } from '../../hooks/constants';
import { useMapEditable } from '../../hooks/useMapEditor';
import Clusters from './Clusters';
import Leitungen from './Leitungen/Draw';
import { LeitungsProvider } from './Leitungen/context';
import MapActionButtons from './MapActionButtons';
import MapSidebar from './MapSidebar';
import PositionAction from './PositionAction';
import UpdateMapPosition from './UpdateMapPosition';
import { DistanceLayer } from './layers/DistanceLayer';
import FirecallLayer from './layers/FirecallLayer';
import UnwetterLayer from './layers/UnwetterLayer';
import DistanceMarker from './markers/DistanceMarker';
import PositionMarker from './markers/PositionMarker';
import { availableLayers, overlayLayers } from './tiles';

function ActionButtons() {
  const map = useMap();
  return <MapActionButtons map={map} />;
}

const StyledMapContainer = styled(MapContainer, {
  shouldForwardProp: (prop) => prop !== 'isEditable',
})<{ isEditable?: boolean }>(({ theme, isEditable = false }) => ({
  [theme.breakpoints.down('sm')]: {
    width: '100%',
  },
  [theme.breakpoints.up('sm')]: {
    width: '80%',
  },
}));

export default function Map() {
  useEffect(() => {
    delete (L.Icon.Default.prototype as any)._getIconUrl;

    L.Icon.Default.mergeOptions({
      iconRetinaUrl: '/icons/leaflet/marker-icon-2x.png',
      iconUrl: '/icons/leaflet/marker-icon.png',
      shadowUrl: '/icons/leaflet/marker-shadow.png',
    });
  }, []);

  const editable = useMapEditable();

  return (
    <Box
      sx={{
        display: 'flex',
        overflow: 'hidden',
        flex: 1,
        minHeight: 0,
        height: '100%',
      }}
    >
      <StyledMapContainer
        isEditable={editable}
        center={defaultPosition}
        zoom={17}
        maxZoom={24}
        scrollWheelZoom={true}
      >
        <LayersControl position="topright">
          {' '}
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
      </StyledMapContainer>
      <MapSidebar />
    </Box>
  );
}
