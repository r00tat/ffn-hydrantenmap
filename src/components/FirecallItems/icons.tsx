import L from 'leaflet';

export const fallbackIcon = L.icon({
  iconUrl: `/icons/marker.svg`,
  iconSize: [24, 24],
  iconAnchor: [12, 12],
  popupAnchor: [0, 0],
});

export const asspIcon = L.icon({
  iconUrl: `/icons/assp.svg`,
  iconSize: [30, 30],
  iconAnchor: [15, 30],
  popupAnchor: [0, -25],
});

export const elIcon = L.icon({
  iconUrl: `/icons/el.svg`,
  iconSize: [30, 30],
  iconAnchor: [15, 30],
  popupAnchor: [0, -25],
});

export const markerIcon = L.icon({
  iconUrl: `/icons/marker.svg`,
  iconSize: [30, 30],
  iconAnchor: [15, 30],
  popupAnchor: [0, -25],
});

export const circleIcon = L.icon({
  iconUrl: `/icons/circle.svg`,
  iconSize: [11, 11],
  iconAnchor: [6, 6],
  popupAnchor: [0, 0],
});
