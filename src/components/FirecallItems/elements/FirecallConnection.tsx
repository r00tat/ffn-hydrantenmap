import { ReactNode } from 'react';
import { Icon, IconOptions } from 'leaflet';
import { defaultPosition } from '../../../hooks/constants';
import { Connection, FirecallItem } from '../../firebase/firestore';
import { circleIcon } from '../icons';
import { FirecallItemBase } from './FirecallItemBase';
import ConnectionMarker from './connection/ConnectionComponent';

export class FirecallConnection extends FirecallItemBase {
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

  public copy(): FirecallConnection {
    return Object.assign(new FirecallConnection(this.data()), this);
  }

  public markerName() {
    return 'Leitung';
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
    };
  }

  public data(): Connection {
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
    return circleIcon;
  }

  public static factory(): FirecallItemBase {
    return new FirecallConnection();
  }

  public popupFn(): ReactNode {
    return (
      <>
        <b>
          {this.markerName()} {this.name}
        </b>
        <br />
        {Math.round(this.distance || 0)}
        m, {Math.ceil((this.distance || 0) / 20)} B Schläuche
      </>
    );
  }
  public renderMarker(selectItem: (item: FirecallItem) => void): ReactNode {
    return (
      <ConnectionMarker record={this} selectItem={selectItem} key={this.id} />
    );
  }

  public static isPolyline(): boolean {
    return true;
  }
}
