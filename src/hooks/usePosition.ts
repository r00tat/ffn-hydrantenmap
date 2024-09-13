'use client';

import { useEffect, useState } from 'react';
import { GeoPositionObject } from '../common/geo';
import { defaultPosition } from './constants';

export type PositionInfo = [
  GeoPositionObject,
  boolean,
  GeolocationPosition | undefined
];

export default function usePosition(): PositionInfo {
  const [position, setPosition] = useState<GeoPositionObject>(defaultPosition);
  const [isSet, setIsSet] = useState(false);
  const [watchId, setWatchId] = useState<number>();
  const [location, setLocation] = useState<GeolocationPosition>();

  useEffect(() => {
    if (navigator.geolocation) {
      const id = navigator.geolocation.watchPosition((geolocation) => {
        setPosition({
          lat: geolocation.coords.latitude,
          lng: geolocation.coords.longitude,
          alt: geolocation.coords.altitude || 0,
        });
        setLocation(geolocation);
        setIsSet(true);
      });
      setWatchId(id);
    } else {
      console.info(`geolocation not supported`);
    }
  }, []);

  useEffect(() => {
    if (watchId) {
      return () => {
        navigator.geolocation.clearWatch(watchId);
      };
    }
  }, [watchId]);

  return [position, isSet, location];
}
