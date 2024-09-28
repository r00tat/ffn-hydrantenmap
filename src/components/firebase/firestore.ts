/**
 * common firestore types and functions
 * can be used on server and client side
 *
 */

/**
 * collection names
 */
export const FIRECALL_COLLECTION_ID = 'call';
export const FIRECALL_ITEMS_COLLECTION_ID = 'item';
export const USER_COLLECTION_ID = 'user';
export const GROUP_COLLECTION_ID = 'groups';
export const CLUSTER_COLLECTION_ID = 'clusters6';

/**
 * base item for all entries in a firecall
 */
export interface FirecallItem {
  id?: string;
  name: string;
  lat?: number;
  lng?: number;
  alt?: number;
  deleted?: boolean;
  type: string;
  beschreibung?: string;
  datum?: string;
  editable?: boolean;
  original?: FirecallItem;
  rotation?: string;
  draggable?: boolean;
  /**
   * reference to FirecallLayer
   */
  layer?: string;

  updatedBy?: string;
  updatedAt?: string;
  creator?: string;
  created?: string;

  // L.LeafletEventHandlerFnMap
  eventHandlers?: L.LeafletEventHandlerFnMap;
}

export const NON_DISPLAYABLE_ITEMS = ['gb', 'diary', 'layer'];

export interface FirecallLayer extends FirecallItem {
  grouped?: string;
}

export interface FcAttachment {
  name: string;
  mimeType?: string;
  data: string;
}

export type FcItemAttachment = string | FcAttachment;

export interface FcMarker extends FirecallItem {
  type: 'marker';
  iconUrl?: string;
  zeichen?: string;
  attachments?: FcItemAttachment[];
  color?: string;
}

export interface Fzg extends FirecallItem {
  fw?: string;
  besatzung?: string;
  ats?: number;
  alarmierung?: string;
  eintreffen?: string;
  abruecken?: string;
  type: 'vehicle';
}

export interface Rohr extends FirecallItem {
  art: 'C' | 'B' | 'Wasserwerfer' | string;
  durchfluss?: number;
  type: 'rohr';
}

export interface Diary extends FirecallItem {
  type: 'diary';
  art?: 'M' | 'B' | 'F';
  nummer?: number;
  datum: string;
  von?: string;
  an?: string;
  erledigt?: string;
}
export interface GeschaeftsbuchEintrag extends FirecallItem {
  type: 'gb';
  nummer?: number;
  ausgehend?: boolean;
  datum: string;
  von?: string;
  an?: string;
}

export interface MultiPointItem extends FirecallItem {
  destLat: number;
  destLng: number;
  /** stringified LatLngPosition[] */
  positions?: string;
  distance?: number;
  color?: string;
  alwaysShowMarker?: string;
}

export interface Connection extends MultiPointItem {
  type: 'connection';
}

export interface Area extends MultiPointItem {
  type: 'area';
  opacity?: number;
  alwaysShowMarker?: string;
}

export interface Line extends MultiPointItem {
  type: 'line';
  opacity?: number;
}

export interface Circle extends FirecallItem {
  type: 'circle';
  radius: number;
  color?: string;
  opacity?: number;
  fill?: string;
}

export const filterActiveItems = (g: FirecallItem | Firecall) =>
  g.deleted !== true;

export const filterDisplayableItems = (g: FirecallItem) => {
  return g.deleted !== true && NON_DISPLAYABLE_ITEMS.indexOf(g.type) < 0;
};

export interface Firecall {
  id?: string;
  name: string;
  fw?: string;
  date?: string;
  description?: string;
  deleted?: boolean;
  alarmierung?: string;
  eintreffen?: string;
  abruecken?: string;
  lat?: number;
  lng?: number;
  sheetId?: string;
  sheetRange?: string;
  group?: string;
  [key: string]: any;
}

export function dateToYmd(date: Date) {
  return `${date.getFullYear()}-${
    date.getMonth() < 10 ? '0' : ''
  }${date.getMonth()}-${date.getDay() < 10 ? '0' : ''}${date.getDay()}`;
}
