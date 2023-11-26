import L, { Icon, IconOptions } from 'leaflet';
import { ReactNode } from 'react';
import { Circle as LeafletCircle } from 'react-leaflet';
import { Circle, FirecallItem } from '../../firebase/firestore';
import { circleIcon } from '../icons';
import { FirecallItemBase } from './FirecallItemBase';

export class CircleMarker extends FirecallItemBase {
  color: string;
  radius: number;
  opacity: number;

  public constructor(firecallItem?: Circle) {
    super(firecallItem);
    this.color = firecallItem?.color || 'green';
    this.radius = firecallItem?.radius || 50;
    this.opacity = firecallItem?.opacity || 100;
  }

  public data(): FirecallItem {
    return {
      ...super.data(),
      color: this.color,
      radius: this.radius,
      opacity: this.opacity,
    } as Circle;
  }

  public title(): string {
    return `Kreis ${this.name}`;
  }
  public info(): string {
    return `Radius: ${this.radius || 0}m`;
  }

  public body(): string {
    return `${this.lat},${this.lng}\nUmkreis:  ${this.radius || 0}m`;
  }

  public dialogText(): ReactNode {
    return (
      <>
        Um die Kreis zu zeichnen, auf die gewünschten Positionen klicken. Zum
        Abschluss auf einen belibigen Punkt klicken. <br />
        {this.name || ''}
      </>
    );
  }

  public fields(): { [fieldName: string]: string } {
    return {
      ...super.fields(),
      radius: 'Radius (m)',
      color: 'Farbe (HTML bzw. Englisch)',
      opacity: 'Deckkraft (in Prozent)',
    };
  }

  public dateFields(): string[] {
    return [];
  }

  public fieldTypes(): { [fieldName: string]: string } | undefined {
    return {};
  }
  public popupFn(): ReactNode {
    return (
      <>
        <b>Kreis {this.name}</b>
        <br />
        {this.radius || 0}m
      </>
    );
  }
  public titleFn(): string {
    return `Kreis ${this.name}: Radius ${this.radius || 0}m`;
  }
  public icon(): Icon<IconOptions> {
    return circleIcon;
  }

  public static factory(): FirecallItemBase {
    return new CircleMarker();
  }

  public renderMarker(selectItem: (item: FirecallItem) => void) {
    return (
      <>
        {super.renderMarker(selectItem)}
        <LeafletCircle
          color={this.color}
          radius={this.radius}
          center={L.latLng(this.lat, this.lng)}
          opacity={this.opacity / 100}
          fill={false}
        >
          {this.renderPopup(selectItem)}
        </LeafletCircle>
      </>
    );
  }
}
