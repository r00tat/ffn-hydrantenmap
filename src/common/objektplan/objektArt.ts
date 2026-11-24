/**
 * Objekte mit Plänen: Risikoobjekte und gefährdete Objekte. Beide kommen aus
 * dem GIS in eigenen Collections (`risikoobjekt`, `gefahrobjekt`) und haben
 * dieselben Felder; ihre Unterlagen liegen jeweils unter dem Objekt
 * (`{art}/{id}/dokument`, Dateien unter `{art}/{id}/`). Die Art ist zugleich
 * der Name der Collection und des Felds im Cluster. Hintergrund:
 * docs/objektplaene.md, „Risikoobjekte und gefährdete Objekte".
 */
import type { GefahrObjekt, RisikoObjekt } from '../gis-objects';

export const OBJEKT_ARTEN = ['risikoobjekt', 'gefahrobjekt'] as const;

export type ObjektArt = (typeof OBJEKT_ARTEN)[number];

export interface ObjektRef {
  art: ObjektArt;
  id: string;
}

/** Ein Objekt mit Plänen, gekennzeichnet mit seiner Art. */
export type PlanObjekt = (RisikoObjekt | GefahrObjekt) & { art: ObjektArt };

const ID_PATTERN = /^[A-Za-z0-9_-]{1,200}$/;

/**
 * Die Art wird Teil eines Firestore- und Storage-Pfads — eine Server Action
 * prüft sie deshalb, bevor sie damit liest oder schreibt.
 */
export function isObjektArt(value: unknown): value is ObjektArt {
  return typeof value === 'string' && (OBJEKT_ARTEN as readonly string[]).includes(value);
}

export function isObjektId(value: unknown): value is string {
  return typeof value === 'string' && ID_PATTERN.test(value);
}

export function isObjektRef(value: unknown): value is ObjektRef {
  if (typeof value !== 'object' || value === null) return false;
  const ref = value as Partial<ObjektRef>;
  return isObjektArt(ref.art) && isObjektId(ref.id);
}

export function tagObjekte<T extends object>(art: ObjektArt, objekte: T[]): Array<T & { art: ObjektArt }> {
  return objekte.map((o) => ({ ...o, art }));
}
