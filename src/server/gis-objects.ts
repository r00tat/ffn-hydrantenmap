export interface GisObject {
  c_x: number;
  c_y: number;
  name: string;
  [key: string]: any;
}

export interface WgsObject {
  id?: string;
  lat: number;
  lng: number;
  name: string;
  [key: string]: any;
}
export interface Coordinates {
  x: number;
  y: number;
}

export interface GisWgsObject extends GisObject, WgsObject {}

export const GEOHASH_PRECISION = 6;

// Name,ortschaft,Typ,Hydranten Nummer,Fuellhydrant,Dimension,Leitungsart,Statischer Druck,Dynamischer Druck,DRUCKMESSUNG_DATUM,Meereshoehe,c_x,c_y,
export interface HydrantenRecord extends GisWgsObject {
  ortschaft: string;
  typ: string;
  hydranten_nummer: string;
  fuellhydrant: string;
  dimension: number | string;
  leitungsart: string;
  statischer_druck: number;
  dynamischer_druck: number;
  druckmessung_datum: string;
  meereshoehe: number;
  geohash: string;
}

export interface GeohashCluster {
  hydranten?: HydrantenRecord[];
  geohash: string;
}
