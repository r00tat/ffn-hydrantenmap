import { SimpleMap } from '../../../common/types';
import { FirecallLayer } from '../../firebase/firestore';
import { FirecallItemBase } from './FirecallItemBase';

export class FirecallItemLayer extends FirecallItemBase {
  grouped?: string;

  public constructor(firecallItem?: FirecallLayer) {
    super({
      ...(firecallItem || { name: '' }),
      type: 'layer',
    } as FirecallItemLayer);
    this.type = 'layer';
    ({ grouped: this.grouped = '' } = firecallItem || {});
  }

  public static firebaseCollectionName(): string {
    return 'layer';
  }

  public markerName(): string {
    return 'Ebene';
  }

  public copy(): FirecallItemBase {
    return Object.assign(new FirecallItemLayer(this.data()), this);
  }

  public fields(): SimpleMap<string> {
    return {
      ...super.fields(),
      grouped: 'Elemente gruppieren',
    };
  }

  public fieldTypes(): SimpleMap<string> {
    return {
      ...super.fieldTypes(),
      grouped: 'boolean',
    };
  }

  public data(): FirecallLayer {
    return {
      ...super.data(),
      grouped: this.grouped,
    };
  }
}
