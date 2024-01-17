import { LayersControl, MapContainer, TileLayer, useMap } from 'react-leaflet';
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

function ActionButtons() {
  const map = useMap();
  return <MapActionButtons map={map} />;
}

export default function Map() {
  return (
    <MapContainer
      center={defaultPosition}
      zoom={17}
      maxZoom={19}
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
              bounds={layer.options.bounds}
              subdomains={layer.options.subdomains}
              key={key}
            />
          </LayersControl.BaseLayer>
        ))}

        <FirecallLayer />

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
        {Object.entries(overlayLayers).map(([key, layer]) => (
          <LayersControl.Overlay name={layer.name} key={key}>
            <TileLayer
              attribution={layer.options.attribution}
              url={layer.url}
              maxZoom={layer.options.maxZoom}
              bounds={layer.options.bounds}
              subdomains={layer.options.subdomains}
              key={key}
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
