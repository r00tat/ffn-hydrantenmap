'use client';

import { Circle, Marker, Popup } from 'react-leaflet';
import { usePositionContext } from '../Position';

export default function PositionMarker() {
  const [position, gotPosition, location] = usePositionContext();
  const accuracy = location?.coords.accuracy;

  return (
    <>
      {gotPosition && (
        <>
          {accuracy !== undefined && accuracy > 0 && (
            <Circle
              center={position}
              radius={accuracy}
              pathOptions={{
                color: '#1976d2',
                weight: 1,
                fillColor: '#1976d2',
                fillOpacity: 0.1,
              }}
            />
          )}
          <Marker position={position} key={position.toString()}>
            <Popup>
              aktuelle Position
              <br />
              {Number.parseFloat('' + position.lat).toFixed(6)},
              {Number.parseFloat('' + position.lng).toFixed(6)}
              {position.alt ? <> ({Math.round(position.alt)}m)</> : null}
              {accuracy !== undefined && (
                <>
                  <br />
                  Genauigkeit: ±{Math.round(accuracy)} m
                </>
              )}
            </Popup>
          </Marker>
        </>
      )}
    </>
  );
}
