import React, { useState, useEffect } from 'react';
import L from 'leaflet';

// Feuerwehrhaus Neusiedl am See
export const defaultPosition: L.LatLng = L.latLng([47.9482913, 16.848222]);

export type PositionInfo = [L.LatLng, boolean, GeolocationPosition | undefined];

export default function usePosition(): PositionInfo {
  const [position, setPosition] = useState<L.LatLng>(defaultPosition);
  const [isSet, setIsSet] = useState(false);
  const [location, setLocation] = useState<GeolocationPosition>();

  useEffect(() => {
    if (navigator.geolocation) {
      navigator.geolocation.watchPosition((geolocation) => {
        setPosition(
          L.latLng([
            geolocation.coords.latitude,
            geolocation.coords.longitude,
            geolocation.coords.altitude || 0,
          ])
        );
        setLocation(geolocation);
        setIsSet(true);
      });
    } else {
      console.info(`geolocation not supported`);
    }
  }, []);

  return [position, isSet, location];
}
