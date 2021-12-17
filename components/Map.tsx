import L from 'leaflet';
import Head from 'next/head';
import { useEffect, useState } from 'react';
import useDistanceLayer from '../hooks/useDistanceLayer';
import useDistanceMarker from '../hooks/useDistanceMarker';
import useHydrantenLayer from '../hooks/useHydrantenLayer';
import { defaultPosition } from '../hooks/usePosition';
import usePositionMarker from '../hooks/usePositionMarker';
import { usePositionContext } from './Position';
import { availableLayers, createLayers, overlayLayers } from './tiles';

const defaultTiles = 'basemap_hdpi';

export default function Map() {
  const [map, setMap] = useState<L.Map>();
  // const [layer, setLayer] = useState(defaultTiles);
  const hydrantenLayer = useHydrantenLayer(map);

  const distanceLayer = useDistanceLayer(map);
  useDistanceMarker(map);
  usePositionMarker(map);

  useEffect(() => {
    const newMap = L.map('map').setView(defaultPosition, 17);

    const baseMaps = createLayers(availableLayers);
    const overlayLayersForMap = createLayers(overlayLayers);

    baseMaps[defaultTiles].addTo(newMap);
    hydrantenLayer.addTo(newMap);
    distanceLayer.addTo(newMap);

    const overlayMaps = {
      Hydranten: hydrantenLayer,
      'Umkreis 50m': distanceLayer,
      ...overlayLayersForMap,
    };
    L.control.layers(baseMaps, overlayMaps).addTo(newMap);

    setMap(newMap);
    return () => {
      newMap.remove();
    };
  }, [hydrantenLayer, distanceLayer]);

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
    </>
  );
}
