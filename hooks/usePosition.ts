import React, { useState, useEffect } from 'react';

// Feuerwehrhaus Neusiedl am See
export const defaultPosition: [number, number] = [47.9482913, 16.848222];

export default function usePosition(): [
  [number, number],
  boolean,
  GeolocationPosition | undefined
] {
  const [position, setPosition] = useState<[number, number]>(defaultPosition);
  const [isSet, setIsSet] = useState(false);
  const [location, setLocation] = useState<GeolocationPosition>();

  useEffect(() => {
    if (navigator.geolocation) {
      navigator.geolocation.watchPosition((geolocation) => {
        setPosition([
          geolocation.coords.latitude,
          geolocation.coords.longitude,
        ]);
        setLocation(geolocation);
        setIsSet(true);
      });
    } else {
      console.info(`geolocation not supported`);
    }
  }, []);

  return [position, isSet, location];
}
