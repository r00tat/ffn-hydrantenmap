import { Icon, IconOptions } from 'leaflet';
import { ReactNode } from 'react';
import { LatLngPosition } from '../../../common/geo';
import { Connection } from '../../firebase/firestore';
import { leafletIcons } from '../icons';
import {
  connectionDisplayPositions,
  isStreetRoutingFallback,
} from './connection/streetRouting';
import { FirecallItemBase } from './FirecallItemBase';
import { FirecallMultiPoint } from './FirecallMultiPoint';

export class FirecallConnection extends FirecallMultiPoint {
  dimension: string;
  oneHozeLength: number;
  streetRouting?: string;
  routedPositions?: string;
  routedFor?: string;
  routingFailed?: string;

  public constructor(firecallItem?: Connection) {
    super(firecallItem);
    this.type = 'connection';
    this.dimension = firecallItem?.dimension || 'B';
    this.oneHozeLength = firecallItem?.oneHozeLength || 20;
    this.streetRouting = firecallItem?.streetRouting;
    this.routedPositions = firecallItem?.routedPositions;
    this.routedFor = firecallItem?.routedFor;
    this.routingFailed = firecallItem?.routingFailed;
  }

  public copy(): FirecallConnection {
    return Object.assign(
      new FirecallConnection(this.data() as Connection),
      this
    );
  }

  public icon(): Icon<IconOptions> {
    return leafletIcons().leitung;
  }

  public markerName() {
    return 'Leitung';
  }

  /**
   * Bei aktivem Straßen-Routing der gespeicherte Straßenverlauf, sonst die
   * direkte Verbindung. Die Länge in `distance` gehört zu genau dieser Linie.
   */
  public displayPositions(): LatLngPosition[] {
    return connectionDisplayPositions(this.data());
  }

  /**
   * Hinweis, wenn das Routing ausgefallen ist: Die Meterangabe ist dann die
   * Luftlinie und damit zu kurz — ohne den Hinweis fehlen im Einsatz Schläuche.
   */
  private routingHint(): string {
    return isStreetRoutingFallback(this.data())
      ? ' (Luftlinie, Straßen-Routing fehlgeschlagen)'
      : '';
  }

  public info(): string {
    return `Länge: ${Math.round(this.distance || 0)}m ${Math.ceil(
      (this.distance || 0) / this.oneHozeLength
    )} ${this.dimension}-Längen${this.routingHint()}`;
  }

  public popupFn(): ReactNode {
    return (
      <>
        <b>
          {this.markerName()} {this.name}
        </b>
        <br />
        {Math.round(this.distance || 0)}
        m, {Math.ceil((this.distance || 0) / this.oneHozeLength)}{' '}
        {this.dimension} Schläuche
        {this.routingHint()}
      </>
    );
  }

  public data(): Connection {
    return {
      ...super.data(),
      dimension: this.dimension || 'B',
      oneHozeLength: this.oneHozeLength || 20,
      streetRouting: this.streetRouting,
      routedPositions: this.routedPositions,
      routedFor: this.routedFor,
      routingFailed: this.routingFailed,
    } as Connection;
  }

  public fields(): { [fieldName: string]: string } {
    return {
      ...super.fields(),
      dimension: 'Dimension (B, C etc)',
      oneHozeLength: 'Länge eines Schlauches (Standard 20m)',
      streetRouting: 'Routing über Straße',
    };
  }

  public fieldTypes(): { [fieldName: string]: string } {
    return {
      ...super.fieldTypes(),
      oneHozeLength: 'number',
      streetRouting: 'boolean',
    };
  }

  public static factory(): FirecallItemBase {
    return new FirecallConnection();
  }
}
