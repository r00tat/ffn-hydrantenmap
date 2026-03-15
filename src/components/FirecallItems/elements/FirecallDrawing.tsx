import React, { ReactNode } from 'react';
import { FirecallItem } from '../../firebase/firestore';
import { FirecallItemBase } from './FirecallItemBase';
import { MarkerRenderOptions } from './marker/FirecallItemDefault';
import DrawingComponent from './drawing/DrawingComponent';

export class FirecallDrawing extends FirecallItemBase {
  public constructor(firecallItem?: FirecallItem) {
    super(firecallItem);
    this.type = 'drawing';
  }

  public copy(): FirecallDrawing {
    return Object.assign(new FirecallDrawing(this.data()), this);
  }

  public markerName(): string {
    return 'Zeichnung';
  }

  public fields(): { [fieldName: string]: string } {
    return {
      name: 'Name',
    };
  }

  public static factory(): FirecallItemBase {
    return new FirecallDrawing();
  }

  public renderMarker(
    selectItem: (item: FirecallItem) => void,
    options: MarkerRenderOptions = {}
  ): ReactNode {
    if (!this.id) return null;
    return (
      <DrawingComponent
        key={this.id}
        item={this.data() as FirecallItem}
        pane={options.pane}
      />
    );
  }
}
