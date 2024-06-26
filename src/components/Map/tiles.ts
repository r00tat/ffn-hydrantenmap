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
