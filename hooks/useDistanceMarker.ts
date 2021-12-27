import L from 'leaflet';
import { useEffect, useState } from 'react';
import { usePositionContext } from '../components/Position';
import { defaultPosition } from '../hooks/usePosition';

export default function useDistanceMarker(map: L.Map) {
  const [position] = usePositionContext();
  const [distanceMarker] = useState(
    L.marker(defaultPosition).bindPopup('aktuelle Position')
  );
  const [distancePosition, setDistancePosition] = useState<L.LatLng>();
  const [initialPositionSet, setInitialPositionSet] = useState(false);

  useEffect(() => {
    if (map) {
      map.on('click', (e) => {
        const pos = (e as any).latlng as L.LatLng;
        console.info(`clicked on ${pos}`);
        if (!initialPositionSet) {
          console.info(`adding distance marker to map`);
          distanceMarker.addTo(map);
          setInitialPositionSet(true);
        }
        distanceMarker.setLatLng(pos);
        // distanceMarker.bindPopup(`aktuelle Position`);
        const popup = distanceMarker.getPopup();
        if (popup) {
          popup.options.autoPan = false;
          distanceMarker.openPopup();
        }
        setDistancePosition(pos);
      });
    }
  }, [distanceMarker, initialPositionSet, map]);

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
      const popup = distanceMarker.getPopup();
      if (popup) {
        popup.options.autoPan = false;
      }
    }
  }, [distanceMarker, distancePosition, position]);

  return distanceMarker;
}
