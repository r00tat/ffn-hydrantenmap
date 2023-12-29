import L, { IconOptions, Icon as LeafletIcon } from 'leaflet';
import { ReactNode } from 'react';
import { FcMarker } from '../../firebase/firestore';
import FileDisplay from '../../inputs/FileDisplay';
import { markerIcon } from '../icons';
import { FirecallItemBase } from './FirecallItemBase';
import { iconKeys } from './icons';

export class FirecallItemMarker extends FirecallItemBase {
  iconUrl: string;
  zeichen: string;
  attachments: string[];

  public constructor(firecallItem?: FcMarker) {
    super(firecallItem);
    this.type = 'marker';
    ({
      iconUrl: this.iconUrl = '',
      zeichen: this.zeichen = '',
      attachments: this.attachments = [],
    } = firecallItem || {});
  }

  public data(): FcMarker {
    return {
      ...super.data(),
      iconUrl: this.iconUrl,
      zeichen: this.zeichen,
      attachments: this.attachments,
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
      zeichen: 'Taktisches Zeichen',
      iconUrl: 'Icon URL',
      attachments: 'Anhänge',
    };
  }

  public fieldTypes(): { [fieldName: string]: string } {
    return {
      zeichen: 'TaktischesZeichen',
      attachments: 'attachment',
    };
  }
  public popupFn(): ReactNode {
    return (
      <>
        <b>
          {this.zeichen?.replace(/_/g, ' ')} {this.name}
        </b>
        <br />
        {this.beschreibung || ''}
        {this.attachments &&
          this.attachments.map((a) => (
            <FileDisplay key={a} url={a} showTitleIfImage={false} />
          ))}
      </>
    );
  }
  public titleFn(): string {
    return `${this.name}\n${this.beschreibung || ''}`;
  }
  public icon(): LeafletIcon<IconOptions> {
    if (this.zeichen && iconKeys[this.zeichen]?.url) {
      const customIcon = iconKeys[this.zeichen];
      return L.icon({
        iconUrl: customIcon.url,
        iconSize: [customIcon.width || 24, customIcon.height || 24],
      });
    }

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
