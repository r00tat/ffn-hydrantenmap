export interface GeoPositionObject {
  lat: number;
  lng: number;
}

export type LatLngPosition = [number, number];

export const defaultLatLngPosition: LatLngPosition = [47.9482913, 16.848222];

export class GeoPosition {
  lat: number;
  lng: number;
  alt: number;
  properties?: { [key: string]: any };

  constructor(
    lat: number = defaultLatLngPosition[0],
    lng: number = defaultLatLngPosition[1],
    alt: number = 0
  ) {
    this.lat = lat;
    this.lng = lng;
    this.alt = alt;
  }

  public static fromGeoJsonPosition(position: GeoJSON.Position): GeoPosition {
    const p = new GeoPosition(position[1], position[0]);
    if (position.length > 2) {
      p.alt = position[2];
    }
    return p;
  }

  public static fromLatLng(position: LatLngPosition): GeoPosition {
    const p = new GeoPosition(position[0], position[1]);
    // if (position.length > 2 && position[2]) {
    //   p.alt = position[2];
    // }
    return p;
  }
  public static fromGeoObject(position: GeoPositionObject): GeoPosition {
    const p = new GeoPosition(position.lat, position.lng);
    if (p instanceof Object) {
      p.properties = {};
      // Object.entries(p).filter(([k,v]) => [lat,l])
      Object.assign(p.properties, position);
      p.properties = position;
    }
    return p;
  }

  public toGeoJson(): GeoJSON.Position {
    return this.alt ? [this.lng, this.lat, this.alt] : [this.lng, this.lat];
  }

  public toLatLngPosition(): LatLngPosition {
    return [this.lat, this.lng];
  }

  public toGeoObject(): GeoPositionObject {
    return {
      ...(this.properties || {}),
      lat: this.lat,
      lng: this.lng,
    };
  }

  public toString(): string {
    return `GeoPosition{lat: ${this.lat}, lng: ${this.lng}}`;
  }
}

export function GeoJsonToLatLng(position: GeoJSON.Position) {
  return GeoPosition.fromGeoJsonPosition(position).toLatLngPosition();
}

export function LatLngToGeoJson(position: LatLngPosition) {
  return GeoPosition.fromLatLng(position).toGeoJson();
}

/**
 * create a lat lng position array with defaults provided
 * @param lat latitude
 * @param lng longituted
 * @returns LatLngPosition like array
 */
export function latLngPosition(lat?: number, lng?: number): LatLngPosition {
  return [lat || defaultLatLngPosition[0], lng || defaultLatLngPosition[1]];
}
