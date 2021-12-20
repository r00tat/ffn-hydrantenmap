import React, { useEffect, useState } from 'react';
import L from 'leaflet';
import { usePositionContext } from '../components/Position';

export const distanceColors: { [key: number]: string } = {
  50: 'red',
  100: 'orange',
  150: 'yellow',
  200: 'green',
  250: 'blue',
};
export const distances: number[] = Object.keys(distanceColors).map((key) =>
  Number.parseInt(key, 10)
);
export const colors: string[] = Object.values(distanceColors);

export default function useDistanceLayer(map: L.Map | undefined) {
  const [distanceLayer] = useState(L.layerGroup());
  const [initialPositionSet, setInitialPositionSet] = useState(false);
  const [position, gotPosition] = usePositionContext();
  const [legend, setLegend] = useState<L.Control>();

  useEffect(() => {
    setLegend(new L.Control({ position: 'bottomright' }));
  }, []);

  useEffect(() => {
    if (map && legend) {
      console.info(`adding legend`);
      legend.onAdd = function () {
        console.info(`adding legend onadd`);
        var div = L.DomUtil.create('div', 'info legend');

        // loop through our density intervals and generate a label with a colored square for each interval
        for (var i = 0; i < distances.length; i++) {
          div.innerHTML +=
            '<i style="background:' +
            colors[i] +
            '">&nbsp;</i> ' +
            distances[i] +
            'm' +
            (distances[i + 1] ? '<br>' : '');
        }

        return div;
      };

      legend?.addTo(map);
    }
  }, [legend, map]);

  useEffect(() => {
    if (gotPosition) {
      // console.info(`got new position ${position}`);

      distanceLayer.clearLayers();
      for (var i = 0; i < distances.length; i++) {
        L.circle(position, {
          color: colors[i],
          radius: distances[i], // every 50 meters
          opacity: 0.5,
          fill: false,
        })
          .bindPopup(`Entfernung: ${i * 50}m`)
          .addTo(distanceLayer);
      }
    }
  }, [gotPosition, position, distanceLayer]);

  useEffect(() => {
    if (!initialPositionSet && gotPosition && map) {
      setInitialPositionSet(true);
      distanceLayer.addTo(map);
    }
  }, [initialPositionSet, gotPosition, map, position, distanceLayer]);

  return distanceLayer;
}
