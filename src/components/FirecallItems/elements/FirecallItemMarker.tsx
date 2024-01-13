import L, { IconOptions, Icon as LeafletIcon } from 'leaflet';
import { ReactNode } from 'react';
import { FcItemAttachment, FcMarker } from '../../firebase/firestore';
import FileDisplay from '../../inputs/FileDisplay';
import { markerIcon } from '../icons';
import { FirecallItemBase } from './FirecallItemBase';
import { iconKeys } from './icons';

export class FirecallItemMarker extends FirecallItemBase {
  iconUrl: string;
  zeichen: string;
  attachments: FcItemAttachment[];

  public constructor(firecallItem?: FcMarker) {
    super(firecallItem);
    this.type = 'marker';
    ({
      iconUrl: this.iconUrl = '',
      zeichen: this.zeichen = '',
      attachments: this.attachments = [],
    } = firecallItem || {});
  }

  public copy(): FirecallItemBase {
    return Object.assign(new FirecallItemMarker(this.data()), this);
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
          this.attachments
            .filter((a) => typeof a === 'string')
            .map((a) => (
              <FileDisplay
                key={a as string}
                url={a as string}
                showTitleIfImage={false}
              />
            ))}
      </>
    );
  }
  public titleFn(): string {
    return `${this.zeichen?.replace(/_/g, ' ')} ${this.name}`;
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

  public body(): ReactNode {
    return (
      <>
        {super.body()}
        {this.attachments &&
          this.attachments
            .filter((a) => typeof a === 'string')
            .map((a) => (
              <FileDisplay
                key={a as string}
                url={a as string}
                showTitleIfImage={false}
              />
            ))}
      </>
    );
  }
}
