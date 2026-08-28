import { TileLayerOptions } from 'leaflet';
import L from 'leaflet';

// GetCapabilities-URLs der Dienste, Layer-IDs des Landes Burgenland und die
// Eigenheiten des WISA-Kachel-Caches (kein GetCapabilities, nur 512er-Kacheln,
// nur WMS 1.1.1/EPSG:3857): docs/kartenlayer.md

export interface TileOptions extends TileLayerOptions {
  [key: string]: any;
}

export interface TileConfig {
  name: string;
  url: string;
  options: TileOptions;
  description?: string;
  type?: 'WMTS' | 'WMS';
  enabled?: boolean;
}

export interface TileConfigs {
  [name: string]: TileConfig;
}

/**
 * Kantenlänge einer WMS-Kachel, wenn die Konfiguration nichts vorgibt.
 *
 * Leaflets Vorgabe wäre 256. 512 ist hier die bessere Grundeinstellung: Der
 * WISA-Cache beantwortet nur 512×512 und quittiert 256 mit `400`, und für die
 * übrigen WMS-Dienste bedeutet es ein Viertel der Anfragen bei gleicher
 * Auflösung — die Auflösung hängt am Verhältnis BBOX/Pixel, nicht an der
 * Kachelgröße, `maxNativeZoom` bleibt also unberührt. Siehe
 * docs/kartenlayer.md.
 *
 * Gilt nur für WMS. XYZ-/WMTS-Kacheln kommen fertig in 256 vom Server; dort
 * bleibt es bei Leaflets Vorgabe.
 */
export const DEFAULT_WMS_TILE_SIZE = 512;

/**
 * Wird der Layer als WMS angefragt?
 *
 * Alles ohne `type` ist ein Kachel-Layer (XYZ/WMTS) und geht an `TileLayer`,
 * `type: 'WMS'` an `WMSTileLayer`. Die Unterscheidung steht hier und nicht als
 * Bedingung im JSX, damit die beiden Listen im Kartenaufbau nachweislich
 * dieselbe Menge aufteilen.
 */
export function isWmsLayer(config: TileConfig): boolean {
  return config.type === 'WMS';
}

/** Kachelgröße eines WMS-Layers: aus der Konfiguration, sonst der Standard. */
export function wmsTileSize(config: TileConfig): number | L.Point {
  return config.options?.tileSize ?? DEFAULT_WMS_TILE_SIZE;
}

export const availableLayers: TileConfigs = {
  basemap_ortofoto: {
    name: 'Orthofoto',
    url: 'https://maps{s}.wien.gv.at/basemap/bmaporthofoto30cm/normal/google3857/{z}/{y}/{x}.jpeg',
    options: {
      maxNativeZoom: 19,
      maxZoom: 24,
      attribution:
        'Datenquelle: <a href="https://www.basemap.at">basemap.at</a>',
      subdomains: ['neu'],
      type: 'normal',
      format: 'jpeg',
      bounds: [
        [46.35877, 8.782379],
        [49.037872, 17.189532],
      ],
    },
  },

  basemap_hdpi: {
    name: 'Basemap',
    url: 'https://maps{s}.wien.gv.at/basemap/bmaphidpi/normal/google3857/{z}/{y}/{x}.jpeg',
    // 'https://maps{s}.wien.gv.at/basemap/bmaphidpi/normal/google3857/{z}/{y}/{x}.jpeg',
    options: {
      maxNativeZoom: 19,
      maxZoom: 24,
      attribution:
        'Datenquelle: <a href="https://www.basemap.at">basemap.at</a>',
      subdomains: ['neu'],
      type: 'normal',
      format: 'jpeg',
      bounds: [
        [46.35877, 8.782379],
        [49.037872, 17.189532],
      ],
    },
  },

  basemap_grey: {
    name: 'Basemap grau',
    url: 'https://maps{s}.wien.gv.at/basemap/bmapgrau/normal/google3857/{z}/{y}/{x}.png',
    options: {
      maxNativeZoom: 19,
      maxZoom: 24,
      attribution:
        'Datenquelle: <a href="https://www.basemap.at">basemap.at</a>',
      subdomains: ['neu'],
      type: 'normal',
      format: 'png',
      bounds: [
        [46.35877, 8.782379],
        [49.037872, 17.189532],
      ],
    },
  },

  openstreetmap: {
    name: 'Openstreetmap',
    url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    options: {
      maxNativeZoom: 19,
      maxZoom: 24,
      subdomains: ['a', 'b', 'c'],
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    },
  },

  opentopomap: {
    name: 'Opentopomap',
    url: 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png',
    options: {
      // OpenTopoMap liefert Kacheln nur bis Zoom 17. maxNativeZoom muss auf 17
      // gesetzt werden, damit Leaflet die 17er-Kacheln für Zoom 18-24 hochskaliert
      // (Overzoom) statt nicht existierende 18er/19er-Kacheln anzufordern (leere Karte).
      maxNativeZoom: 17,
      maxZoom: 24,
      subdomains: ['a', 'b', 'c'],
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors, SRTM | &copy; <a href="http://opentopomap.org/">OpenTopoMap</a> (<a href="https://creativecommons.org/licenses/by-sa/3.0/">CC-BY-SA</a>)',
    },
  },

  orthofoto_bgld: {
    name: 'Orthofoto Burgenland',
    url: 'https://gisenterprise.bgld.gv.at/arcgis/services/public/Orthofoto/MapServer/WMSServer?',
    type: 'WMS',
    options: {
      maxNativeZoom: 19,
      maxZoom: 24,
      attribution:
        '<a href="https://geodaten.bgld.gv.at">Land Burgenland</a> (CC BY 4.0)',
      format: 'image/jpeg',
      subdomains: [''],
      layers: '1',
      transparent: false,
      uppercase: true,
      bounds: [
        [46.82, 15.98],
        [48.16, 17.17],
      ],
    },
  },
};

export const overlayLayers: TileConfigs = {
  adressen: {
    name: 'Adressen',
    url: 'https://maps{s}.wien.gv.at/basemap/bmapoverlay/normal/google3857/{z}/{y}/{x}.png',
    options: {
      maxNativeZoom: 19,
      maxZoom: 24,
      attribution:
        'Datenquelle: <a href="https://www.basemap.at">basemap.at</a>',
      subdomains: ['neu'],
      type: 'normal',
      format: 'png',
      bounds: [
        [46.35877, 8.782379],
        [49.037872, 17.189532],
      ],
    },
    enabled: true,
  },

  // Die vier WISA-Overlays (oberflaechenwasser, riskareas, floodarea,
  // floodarea_river) laufen über einen Kachel-Cache, nicht über einen
  // WMS-Server: nur GetMap, nur VERSION=1.1.1 mit SRS=EPSG:3857, und
  // ausschließlich 512x512 — jede andere Kantenlänge beantwortet der Dienst
  // mit `400`. Das `tileSize` steht deshalb an jedem der vier Layer, obwohl es
  // dem Standard entspricht: Es ist hier eine Zusage des Dienstes, kein
  // Vorschlag. maxNativeZoom 19 ist ebenso die gemessene Obergrenze des
  // Caches. Layerkatalog und Messwerte: docs/kartenlayer.md
  oberflaechenwasser: {
    name: 'Hochwasser Oberflächenwasser',
    // https://tiles.lfrz.gv.at/wisa_hw_risiko?LAYERS=ofa_maxd&FORMAT=image%2Fpng&TRANSPARENT=TRUE&TILED=true&SERVICE=WMS&VERSION=1.1.1&REQUEST=GetMap&STYLES=&SRS=EPSG%3A3857&BBOX=1876070.7619702,6099063.7000818,1877293.7544226,6100286.6925342&WIDTH=512&HEIGHT=512
    url: 'https://tiles.lfrz.gv.at/wisa_hw_risiko?',
    type: 'WMS',
    options: {
      maxNativeZoom: 19,
      maxZoom: 24,
      attribution:
        '<a href="https://maps.wisa.bml.gv.at/gefahren-und-risikokarten-zweiter-zyklus?">Wasser Informationssystem AUSTRIA</a>',
      subdomains: ['neu'],
      type: 'normal',
      format: 'image/png',
      layers: 'ofa_maxd',
      tileSize: 512,
      transparent: true,
      uppercase: true,
      bounds: [
        [46.35877, 8.782379],
        [49.037872, 17.189532],
      ],
    },
  },
  riskareas: {
    name: 'Hochwasser Risikogebiete',
    // https://tiles.lfrz.gv.at/wisa_hw_risiko?LAYERS=hwrisiko_risikobewertung&FORMAT=image%2Fpng&TRANSPARENT=TRUE&TILED=true&SERVICE=WMS&VERSION=1.1.1&REQUEST=GetMap&STYLES=&SRS=EPSG%3A3857&BBOX=1876070.7619702,6099063.7000818,1877293.7544226,6100286.6925342&WIDTH=512&HEIGHT=512
    url: 'https://tiles.lfrz.gv.at/wisa_hw_risiko?',
    type: 'WMS',
    options: {
      maxNativeZoom: 19,
      maxZoom: 24,
      attribution:
        '<a href="https://maps.wisa.bml.gv.at/gefahren-und-risikokarten-zweiter-zyklus?">Wasser Informationssystem AUSTRIA</a>',
      subdomains: ['neu'],
      type: 'normal',
      format: 'image/png',
      layers: 'hwrisiko_risikobewertung',
      tileSize: 512,
      transparent: true,
      uppercase: true,
      bounds: [
        [46.35877, 8.782379],
        [49.037872, 17.189532],
      ],
    },
  },
  floodarea: {
    name: 'Hochwasser Überflutungsgebiete',
    // https://tiles.lfrz.gv.at/wisa_hw_risiko?LAYERS=hwrisiko_gefahren_ueff&FORMAT=image%2Fpng&TRANSPARENT=TRUE&TILED=true&SERVICE=WMS&VERSION=1.1.1&REQUEST=GetMap&STYLES=&SRS=EPSG%3A3857&BBOX=1877293.7544226,6097840.7076294,1878516.746875,6099063.7000818&WIDTH=512&HEIGHT=512
    // https://tiles.lfrz.gv.at/wisa_hw_risiko?LAYERS=hwrisiko_vgd&FORMAT=image%2Fpng&TRANSPARENT=TRUE&TILED=true&SERVICE=WMS&VERSION=1.1.1&REQUEST=GetMap&STYLES=&SRS=EPSG%3A3857&BBOX=1877293.7544226,6097840.7076294,1878516.746875,6099063.7000818&WIDTH=512&HEIGHT=512
    // https://tiles.lfrz.gv.at/wisa_hw_risiko?LAYERS=hwrisiko_apsfr&FORMAT=image%2Fpng&TRANSPARENT=TRUE&TILED=true&SERVICE=WMS&VERSION=1.1.1&REQUEST=GetMap&STYLES=&SRS=EPSG%3A3857&BBOX=1877293.7544226,6097840.7076294,1878516.746875,6099063.7000818&WIDTH=512&HEIGHT=512
    url: 'https://tiles.lfrz.gv.at/wisa_hw_risiko?',
    type: 'WMS',
    options: {
      maxNativeZoom: 19,
      maxZoom: 24,
      attribution:
        '<a href="https://maps.wisa.bml.gv.at/gefahren-und-risikokarten-zweiter-zyklus?">Wasser Informationssystem AUSTRIA</a>',
      subdomains: ['neu'],
      type: 'normal',
      format: 'image/png',
      layers: 'hwrisiko_gefahren_ueff',
      tileSize: 512,
      transparent: true,
      uppercase: true,
      bounds: [
        [46.35877, 8.782379],
        [49.037872, 17.189532],
      ],
    },
  },

  naturgefahren_bgld: {
    name: 'Naturgefahren Burgenland',
    url: 'https://gisenterprise.bgld.gv.at/arcgis/services/public/Nur_Flaechenwidmung/MapServer/WMSServer?',
    type: 'WMS',
    options: {
      maxNativeZoom: 19,
      maxZoom: 24,
      attribution:
        '<a href="https://geodaten.bgld.gv.at">Land Burgenland</a> (CC BY 4.0)',
      format: 'image/png',
      subdomains: [''],
      layers: '5',
      transparent: true,
      uppercase: true,
      bounds: [
        [46.83, 15.99],
        [48.12, 17.16],
      ],
    },
  },

  schutzgebiete_bgld: {
    name: 'Schutz-/Schongebiete Burgenland',
    url: 'https://gisenterprise.bgld.gv.at/arcgis/services/public/Nur_Flaechenwidmung/MapServer/WMSServer?',
    type: 'WMS',
    description:
      'Natur-, Landschafts-, Trinkwasserschutzgebiete',
    options: {
      maxNativeZoom: 19,
      maxZoom: 24,
      attribution:
        '<a href="https://geodaten.bgld.gv.at">Land Burgenland</a> (CC BY 4.0)',
      format: 'image/png',
      subdomains: [''],
      layers: '2',
      transparent: true,
      uppercase: true,
      bounds: [
        [46.76, 15.93],
        [48.29, 17.28],
      ],
    },
  },

  floodarea_river: {
    name: 'Hochwasser Überflutung Flüsse',
    // https://tiles.lfrz.gv.at/wisa_hw_risiko?LAYERS=hwrisiko_gefahren_ueff&FORMAT=image%2Fpng&TRANSPARENT=TRUE&TILED=true&SERVICE=WMS&VERSION=1.1.1&REQUEST=GetMap&STYLES=&SRS=EPSG%3A3857&BBOX=1877293.7544226,6097840.7076294,1878516.746875,6099063.7000818&WIDTH=512&HEIGHT=512
    // https://tiles.lfrz.gv.at/wisa_hw_risiko?LAYERS=hwrisiko_vgd&FORMAT=image%2Fpng&TRANSPARENT=TRUE&TILED=true&SERVICE=WMS&VERSION=1.1.1&REQUEST=GetMap&STYLES=&SRS=EPSG%3A3857&BBOX=1877293.7544226,6097840.7076294,1878516.746875,6099063.7000818&WIDTH=512&HEIGHT=512
    // https://tiles.lfrz.gv.at/wisa_hw_risiko?LAYERS=hwrisiko_apsfr&FORMAT=image%2Fpng&TRANSPARENT=TRUE&TILED=true&SERVICE=WMS&VERSION=1.1.1&REQUEST=GetMap&STYLES=&SRS=EPSG%3A3857&BBOX=1877293.7544226,6097840.7076294,1878516.746875,6099063.7000818&WIDTH=512&HEIGHT=512
    url: 'https://tiles.lfrz.gv.at/wisa_hw_risiko?',
    type: 'WMS',
    options: {
      maxNativeZoom: 19,
      maxZoom: 24,
      attribution:
        '<a href="https://maps.wisa.bml.gv.at/gefahren-und-risikokarten-zweiter-zyklus?">Wasser Informationssystem AUSTRIA</a>',
      subdomains: ['neu'],
      type: 'normal',
      format: 'image/png',
      layers: 'hwrisiko_apsfr',
      tileSize: 512,
      transparent: true,
      uppercase: true,
      bounds: [
        [46.35877, 8.782379],
        [49.037872, 17.189532],
      ],
    },
  },
};

export const createLayers = (
  configs: TileConfigs
): { [name: string]: L.TileLayer } => {
  const layers: { [name: string]: L.TileLayer } = {};
  Object.keys(configs).map((name) => {
    const layer = configs[name];
    layers[name] = L.tileLayer(layer.url, layer.options);
  });
  return layers;
};
