/**
 * Verkehrsmeldungen (Sperren, Baustellen, Ereignisse) für die Kartenebene.
 * Gemeinsame Typen für Server und Client, siehe docs/verkehrsmeldungen.md.
 */

/** Einstufung für die Darstellung, schwerste zuerst. */
export type RoadEventKind = 'closure' | 'restriction' | 'incident';

export const ROAD_EVENT_KIND_ORDER: RoadEventKind[] = [
  'closure',
  'restriction',
  'incident',
];

export type LatLng = [number, number];

/**
 * Herkunft der Meldung. Bisher nur EVIS.AT (Autobahnen und Landesstraßen);
 * weitere Quellen landen in derselben Ebene.
 */
export type RoadEventSource = 'evis';

export interface RoadEvent {
  /** Eindeutig je Situation und Ort. */
  key: string;
  /** ID der DATEX-II-Situation. */
  id: string;
  version: string;
  source: RoadEventSource;
  kind: RoadEventKind;
  /** `Typ:Untertyp` je Eintrag, z. B. `RoadOrCarriagewayOrLaneManagement:roadClosed`. */
  recordTypes: string[];
  road?: string;
  roadName?: string;
  direction?: string;
  /** Wortlaut der Meldung (deutsch), unverändert bis auf Leerraum. */
  description?: string;
  url?: string;
  start?: string;
  end?: string;
  from: LatLng;
  to: LatLng;
  /** Verlauf samt Zwischenpunkten, wenn die Quelle ihn mitliefert. */
  path?: LatLng[];
}

export interface RoadEventWithPath extends RoadEvent {
  /** Verlauf entlang der Straße, `[lat, lng]`. */
  path: LatLng[];
  /** true, wenn die Quelle keinen Verlauf liefert und die Linie gerade ist. */
  approximate: boolean;
}

export interface BoundingBox {
  south: number;
  west: number;
  north: number;
  east: number;
}

export interface RoadEventsResult {
  /** false, wenn kein Zugangsschlüssel hinterlegt ist. */
  configured: boolean;
  events: RoadEventWithPath[];
  /** Pakete, deren Abruf fehlgeschlagen ist. */
  failedFeeds: string[];
}
