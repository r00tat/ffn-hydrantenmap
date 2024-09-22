import { ReactNode } from 'react';
import { Icon, IconOptions } from 'leaflet';
import { defaultPosition } from '../../../hooks/constants';
import { Connection, FirecallItem } from '../../firebase/firestore';
import { leafletIcons } from '../icons';
import { FirecallItemBase } from './FirecallItemBase';
import ConnectionMarker from './connection/ConnectionComponent';
import { FirecallMultiPoint } from './FirecallMultiPoint';

export class FirecallConnection extends FirecallMultiPoint {
  destLat: number = defaultPosition.lat;
  destLng: number = defaultPosition.lng;
  /** stringified LatLngPosition[] */
  positions?: string;
  distance?: number;
  color?: string;
  alwaysShowMarker?: string;

  public constructor(firecallItem?: Connection) {
    super(firecallItem);
    this.type = 'connection';
  }

  public copy(): FirecallConnection {
    return Object.assign(
      new FirecallConnection(this.data() as Connection),
      this
    );
  }

  public markerName() {
    return 'Leitung';
  }

  public info(): string {
    return `Länge: ${Math.round(this.distance || 0)}m ${Math.ceil(
      (this.distance || 0) / 20
    )} B-Längen`;
  }

  public static factory(): FirecallItemBase {
    return new FirecallConnection();
  }
}
