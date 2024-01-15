import { LayersControl, MapContainer, TileLayer, useMap } from 'react-leaflet';
import { defaultPosition } from '../../hooks/constants';
import useFirebaseLogin from '../../hooks/useFirebaseLogin';
import Clusters from './Clusters';
import { LeitungsProvider } from './Leitungen/context';
import Leitungen from './Leitungen/Draw';
import MapActionButtons from './MapActionButtons';
import { DistanceLayer } from './markers/DistanceLayer';
import DistanceMarker from './markers/DistanceMarker';
import FirecallLayer from './markers/FirecallLayer';
import PositionMarker from './markers/PositionMarker';
import PositionAction from './PositionAction';
import { availableLayers, overlayLayers } from './tiles';
import UpdateMapPosition from './UpdateMapPosition';

function ActionButtons() {
  const { isAuthorized } = useFirebaseLogin();
  const map = useMap();
  return <>{isAuthorized && <MapActionButtons map={map} />}</>;
}

export default function Map() {
  const { isAuthorized } = useFirebaseLogin();
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

        {isAuthorized && (
          // <LayersControl.Overlay name="Einsatz" checked>
          <FirecallLayer />
          // </LayersControl.Overlay>
        )}
        <LayersControl.Overlay name="Entfernung">
          <DistanceMarker />
        </LayersControl.Overlay>
        {isAuthorized && <Clusters />}
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
