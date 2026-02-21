import L, { Icon, IconOptions } from 'leaflet';
import { SimpleMap } from '../../../common/types';
import { FirecallLayer } from '../../firebase/firestore';
import { FirecallItemBase, SelectOptions } from './FirecallItemBase';

export class FirecallItemLayer extends FirecallItemBase {
  grouped?: string;
  showSummary?: string;
  summaryPosition?: string;
  clusterMode?: string;

  public constructor(firecallItem?: FirecallLayer) {
    super({
      ...(firecallItem || { name: '' }),
      type: 'layer',
    } as FirecallItemLayer);
    this.type = 'layer';
    ({ grouped: this.grouped = '' } = firecallItem || {});
    this.showSummary = firecallItem?.showSummary ?? 'true';
    // Backward compat: derive summaryPosition from showSummary if not set
    if (firecallItem?.summaryPosition) {
      this.summaryPosition = firecallItem.summaryPosition;
    } else {
      this.summaryPosition = this.showSummary === 'true' ? 'right' : '';
    }
    this.clusterMode = firecallItem?.clusterMode ?? '';
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
      summaryPosition: 'Zusammenfassung Position',
      clusterMode: 'Gruppierung',
    };
  }

  public fieldTypes(): SimpleMap<string> {
    return {
      ...super.fieldTypes(),
      grouped: 'boolean',
      summaryPosition: 'select',
      clusterMode: 'select',
    };
  }

  public selectValues(): SimpleMap<SelectOptions> {
    return {
      ...super.selectValues(),
      summaryPosition: {
        '': 'Aus',
        hover: 'Bei Hover',
        top: 'Oben',
        bottom: 'Unten',
        left: 'Links',
        right: 'Rechts',
      },
      clusterMode: {
        wenig: 'Wenig',
        '': 'Normal',
        viel: 'Viel',
      },
    };
  }

  public data(): FirecallLayer {
    return {
      ...super.data(),
      grouped: this.grouped,
      summaryPosition: this.summaryPosition,
      clusterMode: this.clusterMode,
    };
  }
}
