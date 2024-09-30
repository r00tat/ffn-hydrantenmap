'use client';

import { Marker, Popup } from 'react-leaflet';
import { usePositionContext } from '../Position';

export default function PositionMarker() {
  const [position, gotPosition] = usePositionContext();

  return (
    <>
      {gotPosition && (
        <Marker position={position} key={position.toString()}>
          <Popup>
            aktuelle Position
            <br />
            {Number.parseFloat('' + position.lat).toFixed(6)},
            {Number.parseFloat('' + position.lng).toFixed(6)}
            {position.alt && ` ${Math.round(position.alt)}m`}
          </Popup>
        </Marker>
      )}
    </>
  );
}
