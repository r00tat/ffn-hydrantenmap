import { Icon, IconOptions } from 'leaflet';
import { ReactNode } from 'react';
import { defaultPosition } from '../../../hooks/constants';
import { Area, FirecallItem } from '../../firebase/firestore';
import { circleIcon } from '../icons';
import { FirecallItemBase } from './FirecallItemBase';
import AreaMarker from './area/AreaComponent';

export class FirecallArea extends FirecallItemBase {
  distance: number = 0;
  destLat: number = defaultPosition.lat;
  destLng: number = defaultPosition.lng;
  /** stringified LatLngPosition[] */
  positions?: string;
  color?: string;
  opacity?: number;

  public constructor(firecallItem?: Area) {
    super(firecallItem);
    this.distance = firecallItem?.distance || 0;
    this.destLat = firecallItem?.destLat || defaultPosition.lat;
    this.destLng = firecallItem?.destLng || defaultPosition.lng + 0.0001;
    this.positions = firecallItem?.positions || JSON.stringify([]);
    this.color = firecallItem?.color || 'blue';
    this.opacity = firecallItem?.opacity || 50;
  }

  public data(): Area {
    return {
      ...super.data(),
    } as Area;
  }

  public markerName() {
    return 'Fläche';
  }

  // public title(): string {
  //   return `Marker ${this.name}`;
  // }
  // public info(): string {
  //   return `Länge ${this.distance}m`;
  // }

  public body(): string {
    return `${this.lat},${this.lng} => ${this.destLat},${this.destLng}`;
  }

  public dialogText(): ReactNode {
    return (
      <>
        Um die Fläche zu zeichnen, auf die gewünschten Positionen klicken. Zum
        Abschluss auf einen belibigen Punkt klicken. <br />
        {this.name || ''}
      </>
    );
  }

  public fields(): { [fieldName: string]: string } {
    return {
      ...super.fields(),
      color: 'Farbe (HTML bzw. Englisch)',
      opacity: 'Deckkraft (in Prozent)',
    };
  }

  // public dateFields(): string[] {
  //   return [];
  // }

  public fieldTypes(): { [fieldName: string]: string } {
    return {
      opacity: 'number',
    };
  }
  public popupFn(): ReactNode {
    return (
      <>
        <b>Fläche {this.name}</b>
      </>
    );
  }
  public titleFn(): string {
    return `${this.markerName()} ${this.name}\n${this.beschreibung || ''}`;
  }
  public icon(): Icon<IconOptions> {
    return circleIcon;
  }

  public static factory(): FirecallItemBase {
    return new FirecallArea();
  }

  public renderMarker(selectItem: (item: FirecallItem) => void): ReactNode {
    return <AreaMarker record={this} selectItem={selectItem} key={this.id} />;
  }

  public static isPolyline(): boolean {
    return true;
  }
}
