import L from 'leaflet';
import { useEffect, useState } from 'react';
import { usePositionContext } from '../components/Position';
import { defaultPosition } from '../hooks/usePosition';

export default function useDistanceMarker(map: L.Map | undefined) {
  const [position] = usePositionContext();
  const [distanceMarker] = useState(L.marker(defaultPosition));
  const [distancePosition, setDistancePosition] = useState<L.LatLng>();
  const [initialPositionSet, setInitialPositionSet] = useState(false);

  useEffect(() => {
    if (map) {
      map.on('click', (e) => {
        // console.info(`clicked on ${(e as any).latlng}`);
        setDistancePosition((e as any).latlng as L.LatLng);
      });
    }
  }, [map]);

  useEffect(() => {
    if (distancePosition && map && distanceMarker) {
      if (!initialPositionSet) {
        distanceMarker.addTo(map);
        setInitialPositionSet(true);
      }
      distanceMarker
        .setLatLng(distancePosition)
        .bindPopup(
          `Entfernung zum aktuellen Standort:<br>${Math.round(
            distancePosition.distanceTo(position)
          )}m`
        )
        .openPopup();
    }
  }, [distancePosition, map, distanceMarker, position, initialPositionSet]);

  return distanceMarker;
}