export interface FirecallItem {
  id?: string;
  name?: string;
  lat?: number;
  lng?: number;
  deleted?: boolean;
  type: string;
  beschreibung?: string;
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
  datum: string;
  von: string;
  an: string;
  erledigt: string;
}

export interface Connection extends FirecallItem {
  destLat: number;
  destLng: number;
}

export const filterActiveItems = (g: FirecallItem | Firecall) =>
  g.deleted !== true;

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
