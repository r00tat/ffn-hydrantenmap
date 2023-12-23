import { Icon, IconOptions } from 'leaflet';
import { ReactNode } from 'react';
import { FirecallItem } from '../../firebase/firestore';
import { asspIcon, elIcon } from '../icons';
import { FirecallItemBase } from './FirecallItemBase';

export class FirecallEinsatzleitung extends FirecallItemBase {
  public constructor(firecallItem?: FirecallItem) {
    super(firecallItem);
    this.type = 'el';
  }

  public data(): FirecallItem {
    return {
      ...super.data(),
    } as FirecallItem;
  }

  public markerName() {
    return 'Einsatzleitung';
  }

  // public title(): string {
  //   return `Marker ${this.name}`;
  // }

  // public info(): string {
  //   return `${this.beschreibung || ''}`;
  // }

  // public body(): string {
  //   return `${this.markerName()} ${this.name}
  //       ${this.beschreibung}
  //       position: ${this.lat},${this.lng}`;
  // }

  public dialogText(): ReactNode {
    return <>Einsatzleitung {this.name}</>;
  }

  // public fields(): { [fieldName: string]: string } {
  //   return {
  //     ...super.fields(),
  //   };
  // }

  // public dateFields(): string[] {
  //   return [];
  // }

  public titleFn(): string {
    return `ELung ${this.name}\n${this.beschreibung || ''}`;
  }
  public icon(): Icon<IconOptions> {
    return elIcon;
  }

  public fieldTypes(): { [fieldName: string]: string } {
    return {};
  }

  public static factory(): FirecallItemBase {
    return new FirecallEinsatzleitung();
  }

  public popupFn(): ReactNode {
    return (
      <>
        <b>Einsatzleitung {this.name}</b>
        <br />
        {this.beschreibung || ''}
      </>
    );
  }
  // public renderMarker(selectItem: (item: FirecallItem) => void): ReactNode {
  //   return (

  //   );
  // }
}
