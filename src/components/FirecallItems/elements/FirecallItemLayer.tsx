import L, { Icon, IconOptions } from 'leaflet';
import { SimpleMap } from '../../../common/types';
import {
  DataSchemaField,
  FirecallLayer,
  HeatmapConfig,
} from '../../firebase/firestore';
import { FirecallItemBase, SelectOptions } from './FirecallItemBase';

export class FirecallItemLayer extends FirecallItemBase {
  grouped?: string;
  showSummary?: string;
  summaryPosition?: string;
  clusterMode?: string;
  showLabels?: string;
  dataSchema: DataSchemaField[];
  heatmapConfig?: HeatmapConfig;

  public constructor(firecallItem?: FirecallLayer) {
    super({
      ...(firecallItem || { name: '' }),
      type: 'layer',
    } as FirecallItemLayer);
    this.type = 'layer';
    ({ grouped: this.grouped = '' } = firecallItem || {});
    // Backward compat: derive summaryPosition from old showSummary if not set
    if (firecallItem?.summaryPosition !== undefined) {
      this.summaryPosition = firecallItem.summaryPosition || 'off';
    } else {
      const showSummary = firecallItem?.showSummary ?? 'true';
      this.summaryPosition = showSummary === 'true' ? 'right' : 'off';
    }
    this.clusterMode = firecallItem?.clusterMode || 'normal';
    this.showLabels = firecallItem?.showLabels ?? 'true';
    this.dataSchema = firecallItem?.dataSchema ?? [];
    this.heatmapConfig = firecallItem?.heatmapConfig;
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
    const isGrouped = this.grouped === 'true' || this.grouped === true as any;
    return {
      ...super.fields(),
      showLabels: 'Labels anzeigen',
      grouped: 'Elemente gruppieren',
      ...(isGrouped
        ? {
            summaryPosition: 'Zusammenfassung Position',
            clusterMode: 'Gruppierung',
          }
        : {}),
    };
  }

  public fieldTypes(): SimpleMap<string> {
    return {
      ...super.fieldTypes(),
      showLabels: 'boolean',
      grouped: 'boolean',
      summaryPosition: 'select',
      clusterMode: 'select',
    };
  }

  public selectValues(): SimpleMap<SelectOptions> {
    return {
      ...super.selectValues(),
      summaryPosition: {
        off: 'Aus',
        hover: 'Bei Hover',
        top: 'Oben',
        bottom: 'Unten',
        left: 'Links',
        right: 'Rechts',
      },
      clusterMode: {
        wenig: 'Wenig',
        normal: 'Normal',
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
      showLabels: this.showLabels,
      ...(this.dataSchema.length > 0 ? { dataSchema: this.dataSchema } : {}),
      ...(this.heatmapConfig ? { heatmapConfig: this.heatmapConfig } : {}),
    };
  }
}
