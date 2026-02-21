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
                name: location.name || `${location.street} ${location.number}`.trim(),
                type: 'marker',
                color: LOCATION_STATUS_COLORS[location.status as LocationStatus] || 'red',
                beschreibung: [
                  `${location.street} ${location.number}, ${location.city}`,
                  location.vehicles && typeof location.vehicles === 'object'
                    ? `Fahrzeuge: ${Object.values(location.vehicles).join(', ')}`
                    : location.vehicles && `Fahrzeuge: ${location.vehicles}`,
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
