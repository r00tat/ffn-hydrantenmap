import { TileLayerOptions } from 'leaflet';
import L from 'leaflet';

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
      maxNativeZoom: 19,
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
