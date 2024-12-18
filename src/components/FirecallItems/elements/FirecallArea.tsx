import { Icon, IconOptions } from 'leaflet';
import { ReactNode } from 'react';
import { defaultPosition } from '../../../hooks/constants';
import { Area, FirecallItem } from '../../firebase/firestore';
import { leafletIcons } from '../icons';
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
  alwaysShowMarker?: string;

  public constructor(firecallItem?: Area) {
    super(firecallItem);
    ({
      distance: this.distance = 0,
      destLat: this.destLat = defaultPosition.lat,
      destLng: this.destLng = defaultPosition.lng + 0.0001,
      positions: this.positions = JSON.stringify([]),
      color: this.color = 'blue',
      opacity: this.opacity = 50,
      alwaysShowMarker: this.alwaysShowMarker,
    } = firecallItem || {});
  }

  public copy(): FirecallArea {
    return Object.assign(new FirecallArea(this.data()), this);
  }

  public data(): Area {
    return {
      ...super.data(),
      distance: this.distance,
      destLat: this.destLat,
      destLng: this.destLng,
      positions: this.positions,
      color: this.color,
      opacity: this.opacity,
      alwaysShowMarker: this.alwaysShowMarker,
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

  public body(): ReactNode {
    return (
      <>
        {super.body()}
        {this.lat},{this.lng} =&gt; {this.destLat},{this.destLng}
      </>
    );
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
      alwaysShowMarker: 'Punkte immer anzeigen',
    };
  }

  // public dateFields(): string[] {
  //   return [];
  // }

  public fieldTypes(): { [fieldName: string]: string } {
    return {
      ...super.fieldTypes(),
      opacity: 'number',
      alwaysShowMarker: 'boolean',
      color: 'color',
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
    return leafletIcons().circle;
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
