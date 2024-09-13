'use client';

import L from 'leaflet';
import { defaultPosition } from './constants';

export const toLatLng = (lat?: number, lng?: number) => {
  return L.latLng(lat || defaultPosition.lat, lng || defaultPosition.lng);
};
