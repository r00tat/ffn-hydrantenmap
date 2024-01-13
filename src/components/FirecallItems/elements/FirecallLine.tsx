import { Line } from '../../firebase/firestore';
import { FirecallConnection } from './FirecallConnection';
import { FirecallItemBase } from './FirecallItemBase';

export class FirecallLine extends FirecallConnection {
  opacity?: number;

  public constructor(firecallItem?: Line) {
    super(firecallItem);
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
    return `Länge: ${this.distance || 0}m`;
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
      opacity: this.opacity,
    };
  }
}
