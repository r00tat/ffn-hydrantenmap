import L from 'leaflet';
import Head from 'next/head';
// import 'leaflet/dist/leaflet.css';
import { useEffect, useState } from 'react';
import useHydranten from '../hooks/useHydranten';
import { availableLayers } from './tiles';

const defaultTiles = 'basemap_hdpi';

export default function Map() {
  const [map, setMap] = useState<L.Map>();
  // const [layer, setLayer] = useState(defaultTiles);
  const hydranten = useHydranten();

  useEffect(() => {
    const newMap = L.map('map').setView([47.9299452, 16.8359719], 15);

    const baseMaps: { [name: string]: L.TileLayer } = {};
    Object.keys(availableLayers).map((name) => {
      const layer = availableLayers[name];
      baseMaps[name] = L.tileLayer(layer.url, layer.options);
    });

    baseMaps[defaultTiles].addTo(newMap);

    const overlayMaps = {};
    L.control.layers(baseMaps, overlayMaps).addTo(newMap);

    setMap(newMap);
    return () => {
      newMap.remove();
    };
  }, []);
  // useEffect(() => {
  //   if (map) {
  //     map?.eachLayer((layer) => {
  //       if (layer) {
  //         console.info(`removing layer: ${layer.getAttribution()}`);
  //         layer.remove();
  //       }
  //     });
  //     const tile: TileConfig =
  //       availableLayers[layer] || availableLayers[defaultTiles];

  //     L.tileLayer(tile.url, tile.options)?.addTo(map as L.Map);
  //   }
  // }, [map, layer]);

  useEffect(() => {
    if (map) {
      // only add hydranten if we got the map
      hydranten.forEach((hydrant) => {
        L.marker([hydrant.latitude, hydrant.longitude])
          .bindPopup(
            `<b>${hydrant.zufluss} l/min (${hydrant.nenndurchmesser}mm)</b><br>
          ${hydrant.ortschaft} ${hydrant.name}<br>
          dynamisch: ${hydrant.dynamischerDruck} bar<br>
          statisch: ${hydrant.statischerDruck} bar<br>`
          )
          .addTo(map);
      });
    }
  }, [map, hydranten]);

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
      <h1>FFN Map</h1>
      <div id="map" style={{ height: '80vh' }}></div>
    </>
  );
}
