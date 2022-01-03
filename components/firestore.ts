export interface FirecallItem {
  id?: string;
  name?: string;
  lat?: number;
  lng?: number;
  deleted?: boolean;
  type?: string;
}

export interface Fzg extends FirecallItem {
  fw?: string;
  besatzung?: string;
  ats?: number;
  alarmierung?: string;
  eintreffen?: string;
  abruecken?: string;
}

export const filterActiveItems = (g: FirecallItem) => g.deleted !== true;
