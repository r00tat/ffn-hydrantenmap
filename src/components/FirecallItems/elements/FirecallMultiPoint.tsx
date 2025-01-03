import { Icon, IconOptions } from 'leaflet';
import { ReactNode } from 'react';
import { defaultPosition } from '../../../hooks/constants';
import {
  Connection,
  FirecallItem,
  MultiPointItem,
} from '../../firebase/firestore';
import { leafletIcons } from '../icons';
import { FirecallItemBase } from './FirecallItemBase';
import ConnectionMarker from './connection/ConnectionComponent';

export class FirecallMultiPoint extends FirecallItemBase {
  destLat: number = defaultPosition.lat;
  destLng: number = defaultPosition.lng;
  /** stringified LatLngPosition[] */
  positions?: string;
  distance?: number;
  color?: string;
  alwaysShowMarker?: string;

  public constructor(firecallItem?: MultiPointItem) {
    super(firecallItem);

    if (firecallItem) {
      ({
        destLat: this.destLat,
        destLng: this.destLng,
        positions: this.positions,
        distance: this.distance,
        color: this.color,
        alwaysShowMarker: this.alwaysShowMarker = 'false',
      } = firecallItem);
    }
  }

  public copy(): FirecallMultiPoint {
    return Object.assign(new FirecallMultiPoint(this.data()), this);
  }

  public markerName() {
    return 'MultiPoint';
  }

  public fields(): { [fieldName: string]: string } {
    return {
      ...super.fields(),
      color: 'Farbe (HTML bzw. Englisch)',
      alwaysShowMarker: 'Punkte immer anzeigen',
    };
  }

  public fieldTypes(): { [fieldName: string]: string } {
    return {
      ...super.fieldTypes(),
      alwaysShowMarker: 'boolean',
      color: 'color',
    };
  }

  public data(): MultiPointItem {
    return {
      ...super.data(),
      destLat: this.destLat,
      destLng: this.destLng,
      positions: this.positions,
      distance: this.distance,
      color: this.color,
      alwaysShowMarker: this.alwaysShowMarker,
    } as Connection;
  }

  // public title(): string {
  //   return `${this.name}`;
  // }

  public info(): string {
    return `Länge: ${Math.round(this.distance || 0)}m ${Math.ceil(
      (this.distance || 0) / 20
    )} B-Längen`;
  }

  public body(): ReactNode {
    return (
      <>
        {super.body()}
        {this.lat},{this.lng} =&gt; {this.destLat},{this.destLng}
        <br />
        {this.distance && (
          <>
            Länge: {Math.round(this.distance)}m<br />
          </>
        )}
        {this.color && <>Farbe: {this.color}</>}
      </>
    );
  }

  public dialogText(): ReactNode {
    return (
      <>
        Um die Leitung zu zeichnen, auf die gewünschten Positionen klicken. Zum
        Abschluss auf einen belibigen Punkt klicken. <br />
        {this.name || ''}
      </>
    );
  }

  // public dateFields(): string[] {
  //   return [...super.dateFields()];
  // }

  public titleFn(): string {
    return `${this.markerName()} ${this.name}`;
  }
  public icon(): Icon<IconOptions> {
    return leafletIcons().circle;
  }

  public static factory(): FirecallItemBase {
    return new FirecallMultiPoint();
  }

  public popupFn(): ReactNode {
    return (
      <>
        <b>
          {this.markerName()} {this.name}
        </b>
        <br />
        {Math.round(this.distance || 0)}m
      </>
    );
  }
  public renderMarker(selectItem: (item: FirecallItem) => void): ReactNode {
    try {
      return (
        <ConnectionMarker record={this} selectItem={selectItem} key={this.id} />
      );
    } catch (err) {
      console.error('failed to render marker', err, this.data());
      return <></>;
    }
  }

  public static isPolyline(): boolean {
    return true;
  }
}
