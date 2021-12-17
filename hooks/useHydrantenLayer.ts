import L from 'leaflet';
import { useEffect, useState } from 'react';
import useHydranten from './useHydranten';

export default function useHydrantenLayer(map: L.Map | undefined) {
  // const [layer, setLayer] = useState(defaultTiles);
  const hydranten = useHydranten();
  const [hydrantenLayer] = useState(L.layerGroup([]));

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

  return hydrantenLayer;
}
