import { Icon, IconOptions } from 'leaflet';
import React, { ReactNode } from 'react';
import { LatLngPosition } from '../../../common/geo';
import { Connection, Line } from '../../firebase/firestore';
import { SimpleMap } from '../../../common/types';
import { leafletIcons } from '../icons';
import { FirecallItemBase, SelectOptions } from './FirecallItemBase';
import { FirecallMultiPoint } from './FirecallMultiPoint';

export class FirecallLine extends FirecallMultiPoint {
  opacity?: number;

  public constructor(firecallItem?: Line) {
    super(firecallItem as unknown as Connection);
    this.type = 'line';
    if (firecallItem) {
      ({ opacity: this.opacity } = firecallItem);
    }
    this.color = firecallItem?.color || 'green';
  }

  public copy(): FirecallLine {
    return Object.assign(new FirecallLine(this.data()), this);
  }

  public markerName() {
    return 'Linie';
  }

  public icon(): Icon<IconOptions> {
    return leafletIcons().linie;
  }

  public info(): string {
    return `Länge: ${Math.round(this.distance || 0)}m${this.routingHint()}`;
  }

  public static factory(): FirecallItemBase {
    return new FirecallLine();
  }

  public fields(): { [fieldName: string]: string } {
    return {
      ...super.fields(),
      opacity: 'Deckkraft (in Prozent)',
      streetRouting: 'Routing über Straße',
      routingProfile: 'Routing-Profil',
    };
  }

  public fieldTypes(): { [fieldName: string]: string } {
    return {
      ...super.fieldTypes(),
      streetRouting: 'boolean',
      routingProfile: 'select',
    };
  }

  /**
   * Die Linie kann beides sein: eine Strecke zu Fuß und eine Anfahrt. Für die
   * Anfahrt zählen Einbahnen und Abbiegeverbote, dafür sind Fußwege und
   * Fußgängerzonen kein gültiger Weg.
   */
  public selectValues(): SimpleMap<SelectOptions> {
    return {
      ...super.selectValues(),
      routingProfile: {
        walk: 'Fußgänger (ignoriert Einbahnen)',
        drive: 'Auto (folgt der Fahrtrichtung)',
      },
    };
  }

  public data(): Line {
    return {
      ...super.data(),
      type: 'line',
      opacity: this.opacity,
    } as unknown as Line;
  }

  public popupFn(): ReactNode {
    return (
      <>
        <b>
          {this.markerName()} {this.name}
        </b>
        <br />
        {Math.round(this.distance || 0)}m
        {this.routingHint()}
      </>
    );
  }

  public body(): ReactNode {
    return (
      <>
        {super.body()}
        <br />
        Positionen:
        <br />
        {(JSON.parse(this.positions || '[]') as LatLngPosition[]).map(
          (p, i) => (
            <React.Fragment key={`pos-${this.id}-${i}`}>
              {p[0].toFixed(4)},{p[1].toFixed(4)}
              <br />
            </React.Fragment>
          )
        )}
      </>
    );
  }
}
