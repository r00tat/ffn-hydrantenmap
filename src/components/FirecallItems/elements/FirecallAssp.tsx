import { Icon, IconOptions } from 'leaflet';
import { ReactNode } from 'react';
import { FirecallItem } from '../../firebase/firestore';
import { asspIcon } from '../icons';
import { FirecallItemBase } from './FirecallItemBase';

export class FirecallAssp extends FirecallItemBase {
  public constructor(firecallItem?: FirecallItem) {
    super(firecallItem);
    this.type = 'assp';
  }

  public data(): FirecallItem {
    return {
      ...super.data(),
    } as FirecallItem;
  }

  public markerName() {
    return 'Atemschutzsammelplatz';
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
    return <>ASSP {this.name}</>;
  }

  // public fields(): { [fieldName: string]: string } {
  //   return {
  //     ...super.fields(),
  //   };
  // }

  // public dateFields(): string[] {
  //   return [];
  // }

  public fieldTypes(): { [fieldName: string]: string } {
    return {};
  }
  public popupFn(): ReactNode {
    return (
      <>
        <b>{this.name}</b>
        <br />
        {this.beschreibung || ''}
      </>
    );
  }
  public titleFn(): string {
    return `ASSP ${this.name}\n${this.beschreibung || ''}`;
  }
  public icon(): Icon<IconOptions> {
    return asspIcon;
  }

  public static factory(): FirecallItemBase {
    return new FirecallAssp();
  }

  // public renderMarker(selectItem: (item: FirecallItem) => void): ReactNode {
  //   return (

  //   );
  // }
}
