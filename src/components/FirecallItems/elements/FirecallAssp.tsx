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

  public copy(): FirecallAssp {
    return Object.assign(new FirecallAssp(this.data()), this);
  }

  public data(): FirecallItem {
    return {
      ...super.data(),
    } as FirecallItem;
  }

  public markerName() {
    return 'Atemschutzsammelplatz';
  }

  public dialogText(): ReactNode {
    return <>ASSP {this.name}</>;
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
