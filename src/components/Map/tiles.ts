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
}

export interface TileConfigs {
  [name: string]: TileConfig;
}

export const availableLayers: TileConfigs = {
  // mapbox: {
  //   url: 'https://api.mapbox.com/styles/v1/{id}/tiles/{z}/{x}/{y}?access_token={accessToken}',
  //   options: {
  //     attribution:
  //       'Map data &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors, Imagery © <a href="https://www.mapbox.com/">Mapbox</a>',
  //     maxZoom: 18,
  //     id: 'mapbox/streets-v11',
  //     tileSize: 512,
  //     zoomOffset: -1,
  //     accessToken:
  //       process.env.NEXT_PUBLIC_MAPBOX_APIKEY,
  //   },
  // },
  basemap_ortofoto: {
    name: 'Orthofoto',
    url: 'https://maps{s}.wien.gv.at/basemap/bmaporthofoto30cm/normal/google3857/{z}/{y}/{x}.jpeg',
    options: {
      maxZoom: 19,
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
      maxZoom: 19,
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
      maxZoom: 19,
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
      maxZoom: 19,
      subdomains: ['a', 'b', 'c'],
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    },
  },
};

export const overlayLayers: TileConfigs = {
  adressen: {
    name: 'Adressen',
    url: 'https://maps{s}.wien.gv.at/basemap/bmapoverlay/normal/google3857/{z}/{y}/{x}.png',
    options: {
      maxZoom: 19,
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

  oberflaechenwasser: {
    name: 'Hochwasser Oberflächenwasser',
    // https://tiles.lfrz.gv.at/wisa_hw_risiko?LAYERS=ofa_maxd&FORMAT=image%2Fpng&TRANSPARENT=TRUE&TILED=true&SERVICE=WMS&VERSION=1.1.1&REQUEST=GetMap&STYLES=&SRS=EPSG%3A3857&BBOX=1876070.7619702,6099063.7000818,1877293.7544226,6100286.6925342&WIDTH=512&HEIGHT=512
    url: 'https://tiles.lfrz.gv.at/wisa_hw_risiko?',
    type: 'WMS',
    options: {
      maxZoom: 19,
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
      maxZoom: 19,
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
      maxZoom: 19,
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

  floodarea_river: {
    name: 'Hochwasser Überflutung Flüsse',
    // https://tiles.lfrz.gv.at/wisa_hw_risiko?LAYERS=hwrisiko_gefahren_ueff&FORMAT=image%2Fpng&TRANSPARENT=TRUE&TILED=true&SERVICE=WMS&VERSION=1.1.1&REQUEST=GetMap&STYLES=&SRS=EPSG%3A3857&BBOX=1877293.7544226,6097840.7076294,1878516.746875,6099063.7000818&WIDTH=512&HEIGHT=512
    // https://tiles.lfrz.gv.at/wisa_hw_risiko?LAYERS=hwrisiko_vgd&FORMAT=image%2Fpng&TRANSPARENT=TRUE&TILED=true&SERVICE=WMS&VERSION=1.1.1&REQUEST=GetMap&STYLES=&SRS=EPSG%3A3857&BBOX=1877293.7544226,6097840.7076294,1878516.746875,6099063.7000818&WIDTH=512&HEIGHT=512
    // https://tiles.lfrz.gv.at/wisa_hw_risiko?LAYERS=hwrisiko_apsfr&FORMAT=image%2Fpng&TRANSPARENT=TRUE&TILED=true&SERVICE=WMS&VERSION=1.1.1&REQUEST=GetMap&STYLES=&SRS=EPSG%3A3857&BBOX=1877293.7544226,6097840.7076294,1878516.746875,6099063.7000818&WIDTH=512&HEIGHT=512
    url: 'https://tiles.lfrz.gv.at/wisa_hw_risiko?',
    type: 'WMS',
    options: {
      maxZoom: 19,
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
