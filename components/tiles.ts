import { TileLayerOptions } from 'leaflet';
import L from 'leaflet';

export interface TileOptions extends TileLayerOptions {
  [key: string]: any;
}

export interface TileConfig {
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
  //       'pk.eyJ1IjoicGF1bGZmbiIsImEiOiJja3g2aGFnZmYweTB0MnhvNXM4OW5tZ2plIn0.hT5GjMNjzL6h_5sKNo3uFQ',
  //   },
  // },
  basemap_hdpi: {
    url: 'https://maps{s}.wien.gv.at/basemap/bmaphidpi/{type}/google3857/{z}/{y}/{x}.{format}',
    // 'https://maps{s}.wien.gv.at/basemap/bmaphidpi/normal/google3857/{z}/{y}/{x}.jpeg',
    options: {
      maxZoom: 19,
      attribution:
        'Datenquelle: <a href="https://www.basemap.at">basemap.at</a>',
      subdomains: ['', '1', '2', '3', '4'],
      type: 'normal',
      format: 'jpeg',
      bounds: [
        [46.35877, 8.782379],
        [49.037872, 17.189532],
      ],
    },
  },
  basemap_ortofoto: {
    url: 'https://maps{s}.wien.gv.at/basemap/bmaporthofoto30cm/{type}/google3857/{z}/{y}/{x}.{format}',
    options: {
      maxZoom: 20,
      attribution:
        'Datenquelle: <a href="https://www.basemap.at">basemap.at</a>',
      subdomains: ['', '1', '2', '3', '4'],
      type: 'normal',
      format: 'jpeg',
      bounds: [
        [46.35877, 8.782379],
        [49.037872, 17.189532],
      ],
    },
  },
};

export const overlayLayers: TileConfigs = {
  Adressen: {
    url: 'https://maps{s}.wien.gv.at/basemap/bmapoverlay/{type}/google3857/{z}/{y}/{x}.{format}',
    options: {
      maxZoom: 19,
      attribution:
        'Datenquelle: <a href="https://www.basemap.at">basemap.at</a>',
      subdomains: ['', '1', '2', '3', '4'],
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
