import { LayersControl, MapContainer, TileLayer } from 'react-leaflet';
import { defaultPosition } from '../../hooks/constants';
import Clusters from './Clusters';
import { DistanceLayer } from './markers/DistanceLayer';
import DistanceMarker from './markers/DistanceMarker';
import FirecallLayer from './markers/FirecallLayer';
import PositionMarker from './markers/PositionMarker';
import { availableLayers, overlayLayers } from './tiles';
import UpdateMapPosition from './UpdateMapPosition';

export default function Map() {
  return (
    <>
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

          <LayersControl.Overlay name="Einsatz">
            <FirecallLayer />
          </LayersControl.Overlay>
          <LayersControl.Overlay name="Entfernung">
            <DistanceMarker />
          </LayersControl.Overlay>
          <Clusters />
          <LayersControl.Overlay name="Umkreis" checked>
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
        <UpdateMapPosition />
      </MapContainer>
    </>
  );
}
