import L from 'leaflet';
import { useEffect, useRef, useState } from 'react';
import { Marker, Popup, useMapEvent } from 'react-leaflet';
import { defaultPosition } from '../../hooks/constants';
import { usePositionContext } from '../Position';

export default function DistanceMarker() {
  const [distancePosition, setDistancePosition] =
    useState<L.LatLng>(defaultPosition);
  const [initialPositionSet, setInitialPositionSet] = useState(false);
  const [position] = usePositionContext();
  const markerRef = useRef<L.Marker<any>>(null);

  useMapEvent('click', (event: L.LeafletMouseEvent) => {
    const pos = event.latlng as L.LatLng;
    console.info(`clicked on ${pos}`);
    if (!initialPositionSet) {
      setInitialPositionSet(true);
    }
    setDistancePosition(pos);
  });

  useEffect(() => {
    markerRef?.current?.openPopup();
  }, [markerRef, distancePosition]);

  if (!initialPositionSet) {
    return <></>;
  }

  return (
    <Marker position={distancePosition} ref={markerRef}>
      <Popup autoPan={false}>
        Entfernung zum aktuellen Standort:
        <br />
        {Math.round(distancePosition.distanceTo(position))}m
      </Popup>
    </Marker>
  );
}
