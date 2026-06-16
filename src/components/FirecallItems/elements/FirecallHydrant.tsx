import { Icon, IconOptions } from 'leaflet';
import { ReactNode } from 'react';
import { HydrantenRecord } from '../../../common/gis-objects';
import { HydrantenItem } from '../../firebase/firestore';
import { hydrantIconFn } from '../../Map/markers/HydrantMarker';
import { FirecallItemBase } from './FirecallItemBase';

export class FirecallHydrant extends FirecallItemBase {
  ortschaft: string;
  adresse: string;
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
    this.editable = true;
    ({
      ortschaft: this.ortschaft = '',
      adresse: this.adresse = '',
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
      adresse: this.adresse,
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

  public fields(): { [fieldName: string]: string } {
    return {
      name: 'Name',
      ortschaft: 'Ortschaft',
      adresse: 'Adresse',
      typ: 'Typ',
      hydranten_nummer: 'Hydrantennummer',
      fuellhydrant: 'Füllhydrant',
      dimension: 'Dimension (mm)',
      leitungsart: 'Leitungsart',
      statischer_druck: 'Statischer Druck (bar)',
      dynamischer_druck: 'Dynamischer Druck (bar)',
      leistung: 'Leistung (l/min)',
      beschreibung: 'Beschreibung',
    };
  }

  public fieldTypes(): { [fieldName: string]: string } {
    return {
      ...super.fieldTypes(),
      typ: 'select',
      fuellhydrant: 'select',
      dimension: 'number',
      statischer_druck: 'number',
      dynamischer_druck: 'number',
      beschreibung: 'textarea',
    };
  }

  public selectValues() {
    return {
      typ: {
        Überflurhydrant: 'Überflurhydrant',
        Unterflurhydrant: 'Unterflurhydrant',
      },
      fuellhydrant: {
        '': '',
        ja: 'Ja',
        nein: 'Nein',
      },
    };
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
        {this.adresse && (
          <>
            <br />
            {this.adresse}
          </>
        )}
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
