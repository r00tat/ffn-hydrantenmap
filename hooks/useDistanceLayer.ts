import React, { useEffect, useState } from 'react';
import L from 'leaflet';
import { usePositionContext } from '../components/Position';

export default function useDistanceLayer(map: L.Map | undefined) {
  const [distanceLayer] = useState(L.layerGroup());
  const [initialPositionSet, setInitialPositionSet] = useState(false);
  const [position, gotPosition] = usePositionContext();
  useEffect(() => {
    if (gotPosition) {
      // console.info(`got new position ${position}`);

      distanceLayer.clearLayers();
      for (var i = 1; i <= 10; i++) {
        L.circle(position, {
          color: 'black',
          radius: i * 50, // every 50 meters
          opacity: 0.3,
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
