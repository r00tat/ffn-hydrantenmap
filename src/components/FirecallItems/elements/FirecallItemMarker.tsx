import { Icon, IconOptions } from 'leaflet';
import { ReactNode } from 'react';
import { FirecallItem } from '../../firebase/firestore';
import { markerIcon } from '../icons';
import { FirecallItemBase } from './FirecallItemBase';

export class FirecallItemMarker extends FirecallItemBase {
  public constructor(firecallItem?: FirecallItem) {
    super(firecallItem);
    this.type = 'marker';
  }

  public data(): FirecallItem {
    return {
      ...super.data(),
    } as FirecallItem;
  }

  public markerName() {
    return 'Marker';
  }

  // public title(): string {
  //   return `Marker ${this.name}`;
  // }

  // public info(): string {
  //   return `${this.beschreibung || ''}`;
  // }

  public body(): string {
    return `Marker ${this.name}
        ${this.beschreibung}`;
  }

  public dialogText(): ReactNode {
    return <>Markierung {this.name}</>;
  }

  // public fields(): { [fieldName: string]: string } {
  //   return {
  //     ...super.fields(),
  //   };
  // }

  // public dateFields(): string[] {
  //   return [];
  // }

  public fieldTypes(): { [fieldName: string]: string } | undefined {
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
    return `${this.name}\n${this.beschreibung || ''}`;
  }
  public icon(): Icon<IconOptions> {
    return markerIcon;
  }

  public static factory(): FirecallItemBase {
    return new FirecallItemMarker();
  }

  // public renderMarker(selectItem: (item: FirecallItem) => void) {
  //   return (

  //   );
  // }
}
