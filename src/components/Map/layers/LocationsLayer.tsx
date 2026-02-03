'use client';

import { LayerGroup } from 'react-leaflet';
import useFirecallLocations from '../../../hooks/useFirecallLocations';
import FirecallElement from '../../FirecallItems/elements/FirecallElement';
import { FcMarker, LOCATION_STATUS_COLORS, LocationStatus } from '../../firebase/firestore';

export default function LocationsLayer() {
  const { locations } = useFirecallLocations();

  return (
    <LayerGroup>
      {locations
        .filter((loc) => loc.lat && loc.lng)
        .map((location) => (
          <FirecallElement
            item={
              {
                ...location,
                type: 'marker',
                color: LOCATION_STATUS_COLORS[location.status as LocationStatus] || 'red',
                beschreibung: [
                  `${location.street} ${location.number}, ${location.city}`,
                  location.vehicles && `Fahrzeuge: ${location.vehicles}`,
                  location.description,
                ].filter(Boolean).join('\n'),
                draggable: false,
              } as FcMarker
            }
            selectItem={() => {}}
            key={location.id}
          />
        ))}
    </LayerGroup>
  );
}
