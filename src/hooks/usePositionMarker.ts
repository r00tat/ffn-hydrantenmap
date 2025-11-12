'use client';

import L from 'leaflet';
import { useEffect, useState } from 'react';
import { usePositionContext } from '../components/Map/Position';

export default function usePositionMarker(map: L.Map | undefined) {
  const [initialPositionSet, setInitialPositionSet] = useState(false);
  const [position, gotPosition] = usePositionContext();
  const [positionMarker] = useState(
    L.marker(position)
      // .setTooltipContent('aktuelle Position')
      .bindPopup('aktuelle Position')
  );

  useEffect(() => {
    if (gotPosition) {
      console.info(`got new position ${position}`);
      positionMarker.setLatLng(position);
    }
  }, [positionMarker, gotPosition, position]);

  if (!initialPositionSet && gotPosition && map) {
    console.info(
      `PosMarkerHook: initial position, zooming to ${position.lat},${position.lng}`
    );
    setInitialPositionSet(true);
    map.setView(position);
    positionMarker.addTo(map);
  }
  // }, [initialPositionSet, gotPosition, map, positionMarker, position]);

  return positionMarker;
}
