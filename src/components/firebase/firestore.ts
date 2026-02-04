/**
 * common firestore types and functions
 * can be used on server and client side
 *
 */

import { Hydrant } from '../../common/gis-objects';

/**
 * collection names
 */
export const FIRECALL_COLLECTION_ID = 'call';
export const FIRECALL_ITEMS_COLLECTION_ID = 'item';
export const FIRECALL_HISTORY_COLLECTION_ID = 'history';
export const FIRECALL_LAYERS_COLLECTION_ID = 'layer';
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

export const NON_DISPLAYABLE_ITEMS = ['gb', 'diary', 'layer', 'fallback'];

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
  showLabel?: boolean;
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
  textRepresenation?: string;
}
export interface GeschaeftsbuchEintrag extends FirecallItem {
  type: 'gb';
  nummer?: number;
  ausgehend?: boolean;
  datum: string;
  von?: string;
  an?: string;
  weiterleitung?: string;
  gelesen?: string;
  erledigt?: string;
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
  dimension?: string;
  oneHozeLength?: number;
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
  group?: string;
  [key: string]: any;
}

export function dateToYmd(date: Date) {
  return `${date.getFullYear()}-${
    date.getMonth() < 10 ? '0' : ''
  }${date.getMonth()}-${date.getDay() < 10 ? '0' : ''}${date.getDay()}`;
}

export interface FirecallHistory {
  id?: string;
  description: string;
  createdAt: string;
}

export const FIRECALL_LOCATIONS_COLLECTION_ID = 'location';

export type LocationStatus = 'offen' | 'einsatz notwendig' | 'in arbeit' | 'erledigt' | 'kein einsatz';

export const LOCATION_STATUS_OPTIONS: LocationStatus[] = [
  'offen',
  'einsatz notwendig',
  'in arbeit',
  'erledigt',
  'kein einsatz',
];

export const LOCATION_STATUS_COLORS: Record<LocationStatus, string> = {
  'offen': 'yellow',
  'einsatz notwendig': 'red',
  'in arbeit': 'orange',
  'erledigt': 'green',
  'kein einsatz': 'green',
};

export interface FirecallLocation {
  id?: string;

  // Address
  street: string;
  number: string;
  city: string;

  // Details
  name: string;
  description: string;
  info: string;

  // Status
  status: LocationStatus;
  vehicles: Record<string, string>;

  // Times
  alarmTime?: string;
  startTime?: string;
  doneTime?: string;

  // Coordinates
  lat?: number;
  lng?: number;

  // Metadata
  created: string;
  creator: string;
  updatedAt?: string;
  updatedBy?: string;
  deleted?: boolean;

  // Import tracking
  /** Order/reference number from dispatch system for deduplication during email import */
  auftragsNummer?: string;
}

export const defaultFirecallLocation: Partial<FirecallLocation> = {
  street: '',
  number: '',
  city: 'Neusiedl am See',
  name: '',
  description: '',
  info: '',
  status: 'offen',
  vehicles: {},
};

export interface HydrantenItem extends FirecallItem, Hydrant {
  type: 'hydrant';
}
