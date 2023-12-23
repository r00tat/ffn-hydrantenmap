import L, { IconOptions, Icon as LeafletIcon } from 'leaflet';
import { ReactNode } from 'react';
import { FcMarker } from '../../firebase/firestore';
import { markerIcon } from '../icons';
import { FirecallItemBase } from './FirecallItemBase';

export class FirecallItemMarker extends FirecallItemBase {
  iconUrl: string;
  public constructor(firecallItem?: FcMarker) {
    super(firecallItem);
    this.type = 'marker';
    this.iconUrl = firecallItem?.iconUrl || '';
  }

  public data(): FcMarker {
    return {
      ...super.data(),
      iconUrl: this.iconUrl,
    } as FcMarker;
  }

  public markerName() {
    return 'Marker';
  }

  public dialogText(): ReactNode {
    return <>Markierung {this.name}</>;
  }

  public fields(): { [fieldName: string]: string } {
    return {
      ...super.fields(),
      iconUrl: 'Icon URL',
    };
  }

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
    return `${this.name}\n${this.beschreibung || ''}`;
  }
  public icon(): LeafletIcon<IconOptions> {
    if (this.iconUrl) {
      return L.icon({
        iconUrl: this.iconUrl,
        iconSize: [24, 24],
      });
    }

    return markerIcon;
  }

  public static factory(): FirecallItemBase {
    return new FirecallItemMarker();
  }

  // public renderMarker(selectItem: (item: FirecallItem) => void): ReactNode {
  //   return (

  //   );
  // }
}
