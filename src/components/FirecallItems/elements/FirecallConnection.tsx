import { ReactNode } from 'react';
import { Connection } from '../../firebase/firestore';
import { FirecallItemBase } from './FirecallItemBase';
import { FirecallMultiPoint } from './FirecallMultiPoint';

export class FirecallConnection extends FirecallMultiPoint {
  dimension: string;
  oneHozeLength: number;

  public constructor(firecallItem?: Connection) {
    super(firecallItem);
    this.type = 'connection';
    this.dimension = firecallItem?.dimension || 'B';
    this.oneHozeLength = firecallItem?.oneHozeLength || 20;
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
      (this.distance || 0) / this.oneHozeLength
    )} ${this.dimension}-Längen`;
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
      </>
    );
  }

  public data(): Connection {
    return {
      ...super.data(),
      dimension: this.dimension || 'B',
      oneHozeLength: this.oneHozeLength || 20,
    } as Connection;
  }

  public fields(): { [fieldName: string]: string } {
    return {
      ...super.fields(),
      dimension: 'Dimension (B, C etc)',
      oneHozeLength: 'Länge eines Schlauches (Standard 20m)',
    };
  }

  public fieldTypes(): { [fieldName: string]: string } {
    return {
      ...super.fieldTypes(),
      oneHozeLength: 'number',
    };
  }

  public static factory(): FirecallItemBase {
    return new FirecallConnection();
  }
}
