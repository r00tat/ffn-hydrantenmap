import { useEffect, useState } from 'react';
import { Marker, Popup, useMap } from 'react-leaflet';
import { usePositionContext } from '../Position';

export default function PositionMarker() {
  const map = useMap();
  const [initialPositionSet, setInitialPositionSet] = useState(false);
  const [position, gotPosition] = usePositionContext();

  useEffect(() => {
    if (!initialPositionSet && gotPosition) {
      console.info(`initial position, zooming to ${position}`);
      setInitialPositionSet(true);
      // map.setView(position);
    }
  }, [initialPositionSet, gotPosition, map, position]);

  return (
    <>
      {gotPosition && (
        <Marker position={position} key={position.toString()}>
          <Popup>aktuelle Position</Popup>
        </Marker>
      )}
    </>
  );
}
