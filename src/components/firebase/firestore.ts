export interface FirecallItem {
  id?: string;
  name?: string;
  lat?: number;
  lng?: number;
  deleted?: boolean;
  type: string;
  beschreibung?: string;
  datum?: string;
  editable?: boolean;
  original?: FirecallItem;
  rotation?: string;
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

export interface Connection extends FirecallItem {
  destLat: number;
  destLng: number;
  /** stringified LatLngPosition[] */
  positions?: string;
  distance?: number;
  color?: string;
  alwaysShowMarker?: boolean;
}

export interface Area extends Connection {
  opacity?: number;
  alwaysShowMarker?: boolean;
}

export interface Line extends Connection {
  opacity?: number;
}

export interface Circle extends FirecallItem {
  radius: number;
  color?: string;
  opacity?: number;
  fill?: string;
}

export const filterActiveItems = (g: FirecallItem | Firecall) =>
  g.deleted !== true;

export const filterDisplayableItems = (g: FirecallItem) => {
  return g.deleted !== true && g.type !== 'diary';
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
  [key: string]: any;
}

export function dateToYmd(date: Date) {
  return `${date.getFullYear()}-${
    date.getMonth() < 10 ? '0' : ''
  }${date.getMonth()}-${date.getDay() < 10 ? '0' : ''}${date.getDay()}`;
}
