'use client';

import { LayerGroup } from 'react-leaflet';
import { useLiveLocations } from '../../../hooks/useLiveLocations';
import LiveLocationMarker from '../markers/LiveLocationMarker';

export default function LiveLocationLayer() {
  const locations = useLiveLocations();
  return (
    <LayerGroup>
      {locations.map((loc) => (
        <LiveLocationMarker key={loc.id} loc={loc} />
      ))}
    </LayerGroup>
  );
}
