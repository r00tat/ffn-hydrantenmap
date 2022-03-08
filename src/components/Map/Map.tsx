import { MapContainer, useMap } from 'react-leaflet';
import { defaultPosition } from '../../hooks/constants';
import DistanceMarker from './markers/DistanceMarker';
import Clusters from './Clusters';
import MapLayer from './MapLayer';
import UpdateMapPosition from './UpdateMapPosition';

function MyMapContainer() {
  const map = useMap();
  return <MapLayer map={map} />;
}

export default function Map() {
  return (
    <>
      <MapContainer
        center={defaultPosition}
        zoom={17}
        maxZoom={19}
        scrollWheelZoom={true}
      >
        {/* <TileLayer
    attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
  /> */}
        {/* <Marker position={defaultPosition}>
          <Popup>
            A pretty CSS3 popup. <br /> Easily customizable.
          </Popup>
        </Marker> */}
        {/* <Polyline
          positions={[
            defaultPosition,
            [defaultPosition.lat + 0.01, defaultPosition.lng - 0.01],
          ]}
          color="green"
        /> */}
        <MyMapContainer />
        <UpdateMapPosition />
        <DistanceMarker />
        <Clusters />
      </MapContainer>
    </>
  );
}
