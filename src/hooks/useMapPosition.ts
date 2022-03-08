import { defaultPosition } from './constants';

export const mapPosition = defaultPosition.clone();

export const updateMapPosition = (lat: number, lng: number) => {
  mapPosition.lat = lat;
  mapPosition.lng = lng;
};
