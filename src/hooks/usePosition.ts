'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { GeoPositionObject } from '../common/geo';
import { useSnackbar } from '../components/providers/SnackbarProvider';
import { defaultPosition } from './constants';

export type PositionInfo = [
  GeoPositionObject,
  boolean,
  GeolocationPosition | undefined,
  () => void,
  boolean
];

const reloadAction = {
  label: 'Neu laden',
  onClick: () => window.location.reload(),
};

export default function usePosition(): PositionInfo {
  const [position, setPosition] = useState<GeoPositionObject>(defaultPosition);
  const [isSet, setIsSet] = useState(false);
  const [location, setLocation] = useState<GeolocationPosition>();
  const [isPending, setIsPending] = useState(false);
  const watchIdRef = useRef<number | undefined>(undefined);
  const enabledRef = useRef(false);
  const lastErrorCodeRef = useRef<number | undefined>(undefined);
  const showSnackbar = useSnackbar();

  const startWatching = useCallback(() => {
    if (watchIdRef.current !== undefined) {
      return;
    }
    if (!navigator.geolocation) {
      setIsPending(false);
      showSnackbar(
        'Standortbestimmung wird von diesem Browser nicht unterstützt.',
        'error'
      );
      return;
    }
    const id = navigator.geolocation.watchPosition(
      (geolocation) => {
        setPosition({
          lat: geolocation.coords.latitude,
          lng: geolocation.coords.longitude,
          alt: geolocation.coords.altitude || 0,
        });
        setLocation(geolocation);
        setIsSet(true);
        setIsPending(false);
        lastErrorCodeRef.current = undefined;
      },
      (error) => {
        console.warn('geolocation error', error);
        setIsPending(false);
        if (lastErrorCodeRef.current === error.code) {
          return;
        }
        lastErrorCodeRef.current = error.code;

        if (error.code === error.PERMISSION_DENIED) {
          showSnackbar(
            'Standortzugriff verweigert. Bitte in den Browser-/Systemeinstellungen erlauben und die App neu laden.',
            'error',
            reloadAction
          );
        } else if (error.code === error.POSITION_UNAVAILABLE) {
          showSnackbar(
            'Standort derzeit nicht verfügbar. GPS prüfen oder App neu laden.',
            'warning',
            reloadAction
          );
        } else if (error.code === error.TIMEOUT) {
          showSnackbar(
            'Standortabfrage dauert zu lange. App neu laden kann helfen.',
            'warning',
            reloadAction
          );
        } else {
          showSnackbar(
            `Standortfehler: ${error.message || 'unbekannt'}`,
            'error',
            reloadAction
          );
        }
      },
      {
        enableHighAccuracy: true,
        maximumAge: 0,
        timeout: 15000,
      }
    );
    watchIdRef.current = id;
  }, [showSnackbar]);

  const enableTracking = useCallback(() => {
    if (!enabledRef.current) {
      enabledRef.current = true;
      setIsPending(true);
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

  return [position, isSet, location, enableTracking, isPending];
}
