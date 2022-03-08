import L from 'leaflet';

// Feuerwehrhaus Neusiedl am See
export const defaultPosition: L.LatLng = L.latLng([47.9482913, 16.848222]);

export const toLatLng = (lat?: number, lng?: number) => {
  return L.latLng(lat || defaultPosition.lat, lng || defaultPosition.lng);
};
