import type { FirecallItem } from '../../components/firebase/firestore';

/**
 * Schlanke Projektion eines `FirecallItem`.
 *
 * `FirecallItem` hat einen Index-Signatur-Typ (`[key: string]: any`) und die
 * Dokumente sind entsprechend fett — Geometrien, Rohdaten, gecachte Routen.
 * Für einen Sprachmodell-Kontext ist das unbrauchbar: Es kostet Kontext, ohne
 * etwas beizutragen, und trägt Felder nach draußen, die niemand angefragt hat.
 *
 * Dieselbe Projektion versorgt den Browser-Assistenten (`contextBuilder.ts`)
 * und den MCP-Server. Zwei Zuschnitte für denselben Zweck driften
 * auseinander — dann sieht ein Client mehr als der andere, ohne dass jemand
 * es entschieden hätte.
 */

export interface FirecallItemDto {
  id: string;
  type: string;
  name: string;
  lat?: number;
  lng?: number;
  fw?: string;
  besatzung?: string;
  ats?: number;
  alarmierung?: string;
  eintreffen?: string;
  abruecken?: string;
  art?: string;
  durchfluss?: number;
  datum?: string;
  von?: string;
  an?: string;
  nummer?: string;
  ausgehend?: boolean;
  radius?: number;
  color?: string;
  beschreibung?: string;
}

export interface ProjectItemOptions {
  /**
   * Den Beschreibungstext von Tagebuch- und Geschäftsbucheinträgen mitgeben.
   *
   * Für den Browser-Assistenten aus: Sein Kontext enthält *alle* Elemente des
   * Einsatzes bei jeder Anfrage, und die Einträge sind der längste Teil davon.
   * Der MCP-Server holt Tagebuch und Geschäftsbuch dagegen gezielt und
   * seitenweise — dort ist der Text der eigentliche Inhalt, ohne ihn wäre die
   * Antwort wertlos.
   */
  includeDescription?: boolean;
}

export function projectFirecallItem(
  item: FirecallItem,
  { includeDescription = false }: ProjectItemOptions = {},
): FirecallItemDto {
  const base: FirecallItemDto = {
    id: item.id!,
    type: item.type,
    name: item.name,
    lat: item.lat,
    lng: item.lng,
  };

  switch (item.type) {
    case 'vehicle': {
      const v = item as Record<string, any>;
      if (v.fw) base.fw = v.fw;
      if (v.besatzung) base.besatzung = v.besatzung;
      if (v.ats) base.ats = v.ats;
      if (v.alarmierung) base.alarmierung = v.alarmierung;
      if (v.eintreffen) base.eintreffen = v.eintreffen;
      if (v.abruecken) base.abruecken = v.abruecken;
      break;
    }
    case 'rohr': {
      const r = item as Record<string, any>;
      if (r.art) base.art = r.art;
      if (r.durchfluss) base.durchfluss = r.durchfluss;
      break;
    }
    case 'diary': {
      const d = item as Record<string, any>;
      if (d.art) base.art = d.art;
      if (d.datum) base.datum = d.datum;
      if (d.von) base.von = d.von;
      if (d.an) base.an = d.an;
      if (d.nummer) base.nummer = d.nummer;
      if (includeDescription && d.beschreibung) base.beschreibung = d.beschreibung;
      break;
    }
    case 'gb': {
      const g = item as Record<string, any>;
      if (g.ausgehend !== undefined) base.ausgehend = g.ausgehend;
      if (g.datum) base.datum = g.datum;
      if (g.von) base.von = g.von;
      if (g.an) base.an = g.an;
      if (g.nummer) base.nummer = g.nummer;
      if (includeDescription && g.beschreibung) base.beschreibung = g.beschreibung;
      break;
    }
    case 'circle': {
      const c = item as Record<string, any>;
      if (c.radius) base.radius = c.radius;
      if (c.color) base.color = c.color;
      break;
    }
    default:
      if (item.beschreibung) base.beschreibung = item.beschreibung;
      if (item.datum) base.datum = item.datum;
  }

  return base;
}

/**
 * Schlanke Projektion eines Einsatzes.
 *
 * `Firecall` hat ebenfalls `[key: string]: any` und trägt unter anderem
 * gecachte Routen und Alarm-IDs. Herausgegeben wird nur, was einen Einsatz
 * benennt und verortet.
 */
export interface FirecallDto {
  id: string;
  name: string;
  fw?: string;
  date?: string;
  description?: string;
  group?: string;
  lat?: number;
  lng?: number;
  eintreffen?: string;
  abruecken?: string;
  deleted?: boolean;
}

export function projectFirecall(
  firecall: Record<string, any> & { id?: string },
): FirecallDto {
  return {
    id: firecall.id!,
    name: firecall.name,
    fw: firecall.fw,
    date: firecall.date,
    description: firecall.description,
    group: firecall.group,
    lat: firecall.lat,
    lng: firecall.lng,
    eintreffen: firecall.eintreffen,
    abruecken: firecall.abruecken,
    ...(firecall.deleted ? { deleted: true } : {}),
  };
}
