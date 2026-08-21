import L from 'leaflet';

export interface IconMap {
  [key: string]: L.Icon;
}
export const allIcons: IconMap = {};
let initialized = false;

export const leafletIcons = (): IconMap => {
  if (initialized) {
    return allIcons;
  }

  Object.assign(allIcons, {
    fallback: L.icon({
      iconUrl: `/icons/marker.svg`,
      iconSize: [24, 24],
      iconAnchor: [12, 12],
      popupAnchor: [0, 0],
    }),

    assp: L.icon({
      iconUrl: `/icons/assp.svg`,
      iconSize: [30, 30],
      iconAnchor: [15, 30],
      popupAnchor: [0, -25],
    }),

    el: L.icon({
      iconUrl: `/icons/el.svg`,
      iconSize: [30, 30],
      iconAnchor: [15, 30],
      popupAnchor: [0, -25],
    }),

    marker: L.icon({
      iconUrl: `/icons/marker.svg`,
      iconSize: [30, 30],
      iconAnchor: [15, 30],
      popupAnchor: [0, -25],
    }),

    circle: L.icon({
      iconUrl: `/icons/circle.svg`,
      iconSize: [11, 11],
      iconAnchor: [6, 6],
      popupAnchor: [0, 0],
    }),

    linie: L.icon({
      iconUrl: `/icons/linie.svg`,
      iconSize: [24, 24],
      iconAnchor: [12, 12],
      popupAnchor: [0, 0],
    }),

    flaeche: L.icon({
      iconUrl: `/icons/flaeche.svg`,
      iconSize: [24, 24],
      iconAnchor: [12, 12],
      popupAnchor: [0, 0],
    }),

    leitung: L.icon({
      iconUrl: `/icons/leitung.svg`,
      iconSize: [24, 24],
      iconAnchor: [12, 12],
      popupAnchor: [0, 0],
    }),

    // Vorgeschlagener Standort einer Verstärkerpumpe der Löschwasserförderung.
    // Berechnet und gezeichnet, nicht gespeichert — siehe
    // docs/loeschwasserfoerderung.md.
    pumpe: L.icon({
      iconUrl: `/icons/pumpe.svg`,
      iconSize: [22, 22],
      iconAnchor: [11, 11],
      popupAnchor: [0, -6],
    }),
  });

  initialized = true;
  return allIcons;
};
