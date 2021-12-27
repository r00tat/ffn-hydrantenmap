import L from 'leaflet';
import { useEffect, useState } from 'react';
import { usePositionContext } from '../components/Position';
import { defaultPosition } from '../hooks/usePosition';

export default function useDistanceMarker(map: L.Map) {
  const [position] = usePositionContext();
  const [distanceMarker] = useState(L.marker(defaultPosition));
  const [distancePosition, setDistancePosition] = useState<L.LatLng>();
  const [initialPositionSet, setInitialPositionSet] = useState(false);

  useEffect(() => {
    if (map) {
      map.on('click', (e) => {
        // console.info(`clicked on ${(e as any).latlng}`);
        setDistancePosition((e as any).latlng as L.LatLng);
        setInitialPositionSet(true);
      });
    }
  }, [map]);

  useEffect(() => {
    if (distancePosition && map && distanceMarker) {
      distanceMarker.setLatLng(distancePosition).openPopup();
    }
  }, [distanceMarker, distancePosition, map]);

  useEffect(() => {
    if (initialPositionSet) {
      distanceMarker.addTo(map);
    }
  }, [distanceMarker, initialPositionSet, map]);

  useEffect(() => {
    if (distancePosition) {
      distanceMarker.bindPopup(
        `Entfernung zum aktuellen Standort:<br>${Math.round(
          distancePosition.distanceTo(position)
        )}m`
      );
    }
  }, [distanceMarker, distancePosition, position]);

  return distanceMarker;
}
