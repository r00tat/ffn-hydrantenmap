export interface GisObject {
  c_x: number;
  c_y: number;
  name: string;
  [key: string]: any;
}

export interface WgsObject {
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
