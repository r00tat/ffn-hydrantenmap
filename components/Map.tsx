import L from 'leaflet';
import Head from 'next/head';
// import 'leaflet/dist/leaflet.css';
import { useEffect, useState } from 'react';
import useHydranten from '../hooks/useHydranten';
import usePosition, { defaultPosition } from '../hooks/usePosition';
import { availableLayers, createLayers, overlayLayers } from './tiles';

const defaultTiles = 'basemap_hdpi';

export default function Map() {
  const [map, setMap] = useState<L.Map>();
  // const [layer, setLayer] = useState(defaultTiles);
  const hydranten = useHydranten();
  const [[lat, long], gotPosition] = usePosition();
  const [initialPositionSet, setInitialPositionSet] = useState(false);
  const [hydrantenLayer, setHydrantenLayer] = useState(L.layerGroup([]));
  const [positionMarker, setPositionMarker] = useState(
    L.marker([lat, long])
      // .setTooltipContent('aktuelle Position')
      .bindPopup('aktuelle Position')
  );

  const [distanceLayer, setDistanceLayer] = useState(L.layerGroup());

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
  }, [positionMarker, hydrantenLayer, distanceLayer]);

  useEffect(() => {
    if (map) {
      // only add hydranten if we got the map
      const hydrantIcon = L.icon({
        iconUrl: '/icons/hydrant.png',
        iconSize: [26, 31],
        iconAnchor: [13, 28],
        popupAnchor: [0, 0],
      });
      hydranten.forEach((hydrant) => {
        L.marker([hydrant.latitude, hydrant.longitude], {
          icon: hydrantIcon,
          title: `${hydrant.zufluss} l/min (${hydrant.nenndurchmesser}mm)
${hydrant.ortschaft} ${hydrant.name}
dynamisch: ${hydrant.dynamischerDruck} bar
statisch: ${hydrant.statischerDruck} bar`,
        })
          .bindPopup(
            `<b>${hydrant.zufluss} l/min (${hydrant.nenndurchmesser}mm)</b><br>
          ${hydrant.ortschaft} ${hydrant.name}<br>
          dynamisch: ${hydrant.dynamischerDruck} bar<br>
          statisch: ${hydrant.statischerDruck} bar<br>`
          )
          // .bindTooltip(
          //   L.tooltip({
          //     permanent: true,
          //   }).setContent(`${hydrant.zufluss}`)
          // )
          .addTo(hydrantenLayer);
      });
    }
  }, [map, hydranten, hydrantenLayer]);

  useEffect(() => {
    if (gotPosition) {
      console.info(`got new position ${lat} ${long}`);
      positionMarker.setLatLng([lat, long]);
      distanceLayer.clearLayers();
      for (var i = 1; i <= 10; i++) {
        L.circle([lat, long], {
          color: 'black',
          radius: i * 50, // every 50 meters
          opacity: 0.3,
          fill: false,
        })
          .bindPopup(`Entfernung: ${i * 50}m`)
          .addTo(distanceLayer);
      }
    }
  }, [positionMarker, gotPosition, lat, long, distanceLayer]);

  useEffect(() => {
    if (!initialPositionSet && gotPosition && map) {
      console.info(`initial position, zooming to ${lat} ${long}`);
      setInitialPositionSet(true);
      map.setView([lat, long]);
      positionMarker.addTo(map);
    }
  }, [initialPositionSet, gotPosition, map, lat, long, positionMarker]);

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
