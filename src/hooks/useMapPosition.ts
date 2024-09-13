'use client';

import L from 'leaflet';
import { defaultPosition } from './constants';

export const mapPosition = L.latLng(defaultPosition);

export const updateMapPosition = (lat: number, lng: number) => {
  mapPosition.lat = lat;
  mapPosition.lng = lng;
};
