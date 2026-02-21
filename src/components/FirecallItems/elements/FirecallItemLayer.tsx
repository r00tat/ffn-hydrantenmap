import L, { Icon, IconOptions } from 'leaflet';
import { SimpleMap } from '../../../common/types';
import { FirecallLayer } from '../../firebase/firestore';
import { FirecallItemBase } from './FirecallItemBase';

export class FirecallItemLayer extends FirecallItemBase {
  grouped?: string;
  showSummary?: string;

  public constructor(firecallItem?: FirecallLayer) {
    super({
      ...(firecallItem || { name: '' }),
      type: 'layer',
    } as FirecallItemLayer);
    this.type = 'layer';
    ({ grouped: this.grouped = '' } = firecallItem || {});
    this.showSummary = firecallItem?.showSummary ?? 'true';
  }

  public static firebaseCollectionName(): string {
    return 'layer';
  }

  public markerName(): string {
    return 'Ebene';
  }

  public icon(): Icon<IconOptions> {
    return L.icon({
      iconUrl: '/icons/layer.svg',
      iconSize: [24, 24],
      iconAnchor: [12, 12],
      popupAnchor: [0, 0],
    });
  }

  public copy(): FirecallItemBase {
    return Object.assign(new FirecallItemLayer(this.data()), this);
  }

  public fields(): SimpleMap<string> {
    return {
      ...super.fields(),
      grouped: 'Elemente gruppieren',
      showSummary: 'Zusammenfassung anzeigen',
    };
  }

  public fieldTypes(): SimpleMap<string> {
    return {
      ...super.fieldTypes(),
      grouped: 'boolean',
      showSummary: 'boolean',
    };
  }

  public data(): FirecallLayer {
    return {
      ...super.data(),
      grouped: this.grouped,
      showSummary: this.showSummary,
    };
  }
}
