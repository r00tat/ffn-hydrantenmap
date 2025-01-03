'use client';
import L, { Icon, IconOptions } from 'leaflet';
import { ReactNode } from 'react';
import { Circle as LeafletCircle } from 'react-leaflet';
import { Circle, FirecallItem } from '../../firebase/firestore';
import { leafletIcons } from '../icons';
import { FirecallItemBase } from './FirecallItemBase';
import { MarkerRenderOptions } from './marker/FirecallItemDefault';

export class CircleMarker extends FirecallItemBase {
  color: string;
  radius: number;
  opacity: number;
  fill: string;

  public constructor(firecallItem?: Circle) {
    super(firecallItem);
    this.color = firecallItem?.color || 'green';
    this.radius = firecallItem?.radius || 50;
    this.opacity = firecallItem?.opacity || 100;
    this.fill = firecallItem?.fill === undefined ? 'true' : firecallItem.fill;
  }

  public copy(): CircleMarker {
    return Object.assign(new CircleMarker(this.data()), this);
  }

  public data(): Circle {
    return {
      ...super.data(),
      color: this.color,
      radius: this.radius,
      opacity: this.opacity,
      fill: this.fill,
    } as Circle;
  }

  public markerName(): string {
    return `Kreis`;
  }

  public title(): string {
    return `${this.markerName()} ${this.name}`;
  }
  public info(): string {
    return `Radius: ${this.radius || 0}m`;
  }

  public body(): ReactNode {
    return (
      <>
        {super.body()}
        Umkreis: {this.radius || 0}m<br />
        Farbe: {this.color} {this.fill && '(ausgefüllt)'}
      </>
    );
  }

  public dialogText(): ReactNode {
    return (
      <>
        Um die Kreis zu zeichnen, auf die gewünschten Positionen klicken. <br />
        {this.name || ''}
      </>
    );
  }

  public fields(): { [fieldName: string]: string } {
    return {
      ...super.fields(),
      radius: 'Radius (m)',
      color: 'Farbe (HTML bzw. Englisch)',
      fill: 'Kreis ausfüllen',
      opacity: 'Deckkraft (in Prozent)',
    };
  }

  public dateFields(): string[] {
    return [];
  }

  public fieldTypes(): { [fieldName: string]: string } {
    return {
      ...super.fieldTypes(),
      fill: 'boolean',
      color: 'color',
    };
  }
  public popupFn(): ReactNode {
    return (
      <>
        <b>Kreis {this.name}</b>
        <br />
        {this.radius || 0}m {this.color} {this.fill && '(ausgefüllt)'}
      </>
    );
  }
  public titleFn(): string {
    return `Kreis ${this.name}`;
  }
  public icon(): Icon<IconOptions> {
    return leafletIcons().circle;
  }

  public static factory(): FirecallItemBase {
    return new CircleMarker();
  }

  public renderMarker(
    selectItem: (item: FirecallItem) => void,
    { hidePopup = false }: MarkerRenderOptions = {}
  ) {
    return (
      <>
        {!hidePopup && super.renderMarker(selectItem)}
        <LeafletCircle
          key={'circle' + this.id}
          radius={this.radius}
          center={L.latLng(this.lat, this.lng)}
          pathOptions={{
            color: this.color,
            fill: this.fill === 'true',
            opacity: this.opacity / 100,
            fillOpacity: this.opacity / 100 / 3,
          }}
        >
          {!hidePopup && this.renderPopup(selectItem)}
        </LeafletCircle>
      </>
    );
  }
}
