import { FirecallItem, FirecallLayer } from '../../firebase/firestore';
import { FirecallItemBase } from './FirecallItemBase';

export interface FirecallItemLayerInt extends FirecallItem, FirecallLayer {}

export class FirecallItemLayer extends FirecallItemBase {
  public constructor(firecallItem?: FirecallItemLayerInt) {
    super({
      ...(firecallItem || { name: '' }),
      type: 'layer',
    } as FirecallItemLayer);
    this.type = 'layer';
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
}
