'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { GeoPositionObject } from '../common/geo';
import { defaultPosition } from './constants';

export type PositionInfo = [
  GeoPositionObject,
  boolean,
  GeolocationPosition | undefined,
  () => void
];

export default function usePosition(): PositionInfo {
  const [position, setPosition] = useState<GeoPositionObject>(defaultPosition);
  const [isSet, setIsSet] = useState(false);
  const [location, setLocation] = useState<GeolocationPosition>();
  const watchIdRef = useRef<number | undefined>(undefined);
  const enabledRef = useRef(false);

  const startWatching = useCallback(() => {
    if (!navigator.geolocation || watchIdRef.current !== undefined) {
      return;
    }
    const id = navigator.geolocation.watchPosition((geolocation) => {
      setPosition({
        lat: geolocation.coords.latitude,
        lng: geolocation.coords.longitude,
        alt: geolocation.coords.altitude || 0,
      });
      setLocation(geolocation);
      setIsSet(true);
    });
    watchIdRef.current = id;
  }, []);

  const enableTracking = useCallback(() => {
    if (!enabledRef.current) {
      enabledRef.current = true;
      startWatching();
    }
  }, [startWatching]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (watchIdRef.current !== undefined) {
        navigator.geolocation.clearWatch(watchIdRef.current);
      }
    };
  }, []);

  return [position, isSet, location, enableTracking];
}
