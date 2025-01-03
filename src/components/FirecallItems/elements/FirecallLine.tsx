import React, { ReactNode } from 'react';
import { LatLngPosition } from '../../../common/geo';
import { Connection, Line } from '../../firebase/firestore';
import { FirecallItemBase } from './FirecallItemBase';
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

  public info(): string {
    return `Länge: ${Math.round(this.distance || 0)}m`;
  }

  public static factory(): FirecallItemBase {
    return new FirecallLine();
  }

  public fields(): { [fieldName: string]: string } {
    return {
      ...super.fields(),
      opacity: 'Deckkraft (in Prozent)',
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
