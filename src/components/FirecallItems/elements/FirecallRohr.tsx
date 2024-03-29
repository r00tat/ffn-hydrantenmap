import L, { Icon, IconOptions } from 'leaflet';
import { ReactNode } from 'react';
import { FirecallItem, Rohr } from '../../firebase/firestore';
import { FirecallItemBase, SelectOptions } from './FirecallItemBase';
import { SimpleMap } from '../../../common/types';

export class FirecallRohr extends FirecallItemBase {
  art: 'C' | 'B' | 'D' | 'Wasserwerfer' | string = 'C';
  durchfluss?: number;

  public constructor(firecallItem?: Rohr) {
    super(firecallItem);
    this.type = 'rohr';
    if (firecallItem) {
      ({ durchfluss: this.durchfluss, art: this.art = 'C' } = firecallItem);
    }
  }

  public copy(): FirecallRohr {
    return Object.assign(new FirecallRohr(this.data()), this);
  }

  public markerName() {
    return 'Rohr';
  }

  public fields(): { [fieldName: string]: string } {
    return {
      ...super.fields(),
      art: 'Rohr Art',
      durchfluss: 'Durchfluss (l/min)',
      rotation: 'Drehung in Grad',
    };
  }

  public fieldTypes(): { [fieldName: string]: string } {
    return {
      ...super.fieldTypes(),
      rotation: 'number',
      durchfluss: 'number',
      art: 'select',
    };
  }

  public selectValues(): SimpleMap<SelectOptions> {
    return {
      art: {
        C: 'C-Rohr',
        B: 'B-Rohr',
        D: 'D-Rohr',
        Wasserwerfer: 'Wasserwerfer',
      },
    };
  }

  public data(): Rohr {
    return {
      ...super.data(),
      durchfluss: this.durchfluss,
      art: this.art,
    } as Rohr;
  }

  public title(): string {
    return `${this.art} Rohr ${this.name}`;
  }

  public info(): string {
    return `${this.durchfluss ? this.durchfluss + ' l/min' : ''}`;
  }

  // public body(): string {
  //   return `${this.markerName()} ${this.name}
  //       ${this.beschreibung}
  //       position: ${this.lat},${this.lng}`;
  // }

  public dialogText(): ReactNode {
    return <>C/B Rohr oder Wasserwerfer</>;
  }

  // public dateFields(): string[] {
  //   return [];
  // }

  public titleFn(): string {
    return `${this.name} ${this.art || ''}${
      this.durchfluss ? ` ${this.durchfluss}l/min` : ''
    }`;
  }
  public icon(): Icon<IconOptions> {
    return L.icon({
      iconUrl: `/icons/rohr${
        ['b', 'c', 'ww', 'wasserwerfer'].indexOf(this.art.toLowerCase()) >= 0
          ? '-' + this.art.toLowerCase()
          : ''
      }.svg`,
      iconSize: [24, 24],
      iconAnchor: [12, 12],
      popupAnchor: [0, 0],
    });
  }

  public static factory(): FirecallItemBase {
    return new FirecallRohr();
  }

  public popupFn(): ReactNode {
    return (
      <>
        <b>
          {this.name} {this.art} Rohr
        </b>
        {this.durchfluss && (
          <>
            <br />
            Durchfluss: {this.durchfluss} l/min
          </>
        )}
      </>
    );
  }
  // public renderMarker(selectItem: (item: FirecallItem) => void): ReactNode {
  //   return (

  //   );
  // }

  public body(): ReactNode {
    return (
      <>
        {this.art?.toLocaleUpperCase()} Rohr{' '}
        {this.durchfluss && <>{this.durchfluss}l/min</>}
        {super.body()}
      </>
    );
  }
}
