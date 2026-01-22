import { Icon, IconOptions } from 'leaflet';
import { ReactNode } from 'react';
import { HydrantenRecord } from '../../../common/gis-objects';
import { HydrantenItem } from '../../firebase/firestore';
import { hydrantIconFn } from '../../Map/markers/HydrantMarker';
import { FirecallItemBase } from './FirecallItemBase';

export class FirecallHydrant extends FirecallItemBase {
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
  leistung?: string;

  public constructor(firecallItem?: HydrantenItem) {
    super(firecallItem);
    this.type = 'hydrant';
    this.editable = false;
    ({
      ortschaft: this.ortschaft = '',
      typ: this.typ = 'Überflurhydrant',
      hydranten_nummer: this.hydranten_nummer = '',
      fuellhydrant: this.fuellhydrant = '',
      dimension: this.dimension = '',
      leitungsart: this.leitungsart = '',
      statischer_druck: this.statischer_druck = 0,
      dynamischer_druck: this.dynamischer_druck = 0,
      druckmessung_datum: this.druckmessung_datum = '',
      meereshoehe: this.meereshoehe = 0,
      geohash: this.geohash = '',
      leistung: this.leistung = '',
    } = firecallItem || {});
  }

  public copy(): FirecallHydrant {
    return Object.assign(new FirecallHydrant(this.data()), this);
  }

  public data(): HydrantenItem {
    return {
      ...super.data(),
      ortschaft: this.ortschaft,
      typ: this.typ,
      hydranten_nummer: this.hydranten_nummer,
      fuellhydrant: this.fuellhydrant,
      dimension: this.dimension,
      leitungsart: this.leitungsart,
      statischer_druck: this.statischer_druck,
      dynamischer_druck: this.dynamischer_druck,
      druckmessung_datum: this.druckmessung_datum,
      meereshoehe: this.meereshoehe,
      geohash: this.geohash,
      leistung: this.leistung,
    } as HydrantenItem;
  }

  public markerName() {
    return 'Hydrant';
  }

  public dialogText(): ReactNode {
    return <>Hydrant {this.name}</>;
  }

  public popupFn(): ReactNode {
    return (
      <>
        <b>
          {this.ortschaft} {this.name}
          <br />
          {this.leistung ? this.leistung + ' l/min ' : ''} ({this.dimension}mm)
        </b>
        <br />
        dynamisch: {this.dynamischer_druck} bar
        <br />
        statisch: {this.statischer_druck} bar
        {this.fuellhydrant?.toLowerCase() === 'ja' && (
          <>
            <br />
            Füllhydrant
          </>
        )}
        {this.leitungsart && (
          <>
            <br />
            {this.leitungsart}
          </>
        )}
      </>
    );
  }
  public titleFn(): string {
    return `Hydrant ${this.ortschaft} ${this.name} ${
      this.leistung ? this.leistung + ' l/min ' : ''
    } (
          ${this.dimension}mm)`;
  }
  public icon(): Icon<IconOptions> {
    return hydrantIconFn(this.data() as unknown as HydrantenRecord);
  }

  public static factory(): FirecallItemBase {
    return new FirecallHydrant();
  }

  // public renderMarker(selectItem: (item: FirecallItem) => void): ReactNode {
  //   return (

  //   );
  // }
}
