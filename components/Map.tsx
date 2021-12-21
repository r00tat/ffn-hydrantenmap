import L from 'leaflet';
import Head from 'next/head';
import { useEffect, useState } from 'react';
import { defaultPosition } from '../hooks/usePosition';
import MapLayer from './MapLayer';

export default function Map() {
  const [map, setMap] = useState<L.Map>();

  useEffect(() => {
    const newMap = L.map('map').setView(defaultPosition, 17);

    setMap(newMap);
    return () => {
      newMap.remove();
    };
  }, []);

  return (
    <>
      <Head>
        <link
          rel="stylesheet"
          href="https://unpkg.com/leaflet@1.7.1/dist/leaflet.css"
          integrity="sha512-xodZBNTC5n17Xt2atTPuE1HxjVMSvLVW9ocqUKLsCC5CXdbqCmblAshOMAS6/keqq/sMZMZ19scR4PsZChSR7A=="
          crossOrigin=""
        />
      </Head>

      <div id="map" style={{ height: '86vh' }}></div>

      {map && <MapLayer map={map} />}
    </>
  );
}
