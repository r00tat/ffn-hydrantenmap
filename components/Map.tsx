import L from 'leaflet';
import Head from 'next/head';
import { useState } from 'react';
import { MapContainer, Marker, Popup, useMap } from 'react-leaflet';
import { defaultPosition } from '../hooks/usePosition';
import MapLayer from './MapLayer';

function MyMapContainer() {
  const map = useMap();
  return <MapLayer map={map} />;
}

export default function Map() {
  // const [map, setMap] = useState<L.Map>();

  // useEffect(() => {
  //   const newMap = L.map('map', {
  //     center: defaultPosition,
  //     zoom: 17,
  //     maxZoom: 30,
  //   });

  //   setMap(newMap);
  //   return () => {
  //     newMap.remove();
  //   };
  // }, []);

  return (
    <>
      {/* <div id="map" style={{ height: '86vh' }}></div>
       */}

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
        <MyMapContainer />
      </MapContainer>
    </>
  );
}
