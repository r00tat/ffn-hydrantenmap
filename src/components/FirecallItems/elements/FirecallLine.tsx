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

  public markerName() {
    return 'Linie';
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
