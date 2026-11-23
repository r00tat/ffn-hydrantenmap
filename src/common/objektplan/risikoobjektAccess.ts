/**
 * Wer die Unterlagen eines Risikoobjekts sieht und wer das Objekt pflegt.
 * Rein, ohne Firebase: Server Actions, Oberfläche und Tests teilen dieselbe
 * Entscheidung. Hintergrund: docs/objektplaene.md, „Freigabe an Gruppen".
 *
 * Die Freigabe steht als `groups` am Objekt. Das Objekt selbst (Name, Lage)
 * sieht weiterhin jeder angemeldete Benutzer; geschützt sind die Unterlagen.
 */
import type { RisikoObjekt, WgsObject } from '../gis-objects';
import { can, isMember, type PermissionUser } from '../permissions';
import { isTenantGroupId } from '../tenantGroups';

export const RISIKOOBJEKT_MANAGE = 'risikoobjekte.manage' as const;

/** Die freigegebenen Gruppen eines Objekts, ohne Pseudo-Gruppen. */
export function objektGroups(objekt: Pick<RisikoObjekt, 'groups'> | { groups?: unknown }): string[] {
  const groups = Array.isArray(objekt.groups) ? objekt.groups : [];
  return [...new Set(groups.filter((g): g is string => typeof g === 'string' && isTenantGroupId(g)))];
}

/**
 * Darf der Benutzer die Unterlagen sehen? Mitglied einer freigegebenen Gruppe
 * oder globaler Admin. Ein Objekt ohne Freigabe sieht nur der Admin.
 */
export function canSeeObjektPlans(user: PermissionUser, objekt: { groups?: unknown }): boolean {
  if (user.isAdmin) return true;
  return objektGroups(objekt).some((g) => isMember(user, g));
}

/** Darf der Benutzer das Objekt und seine Unterlagen pflegen? */
export function canManageRisikoObjekt(user: PermissionUser, objekt: { groups?: unknown }): boolean {
  if (user.isAdmin) return true;
  return objektGroups(objekt).some((g) => can(user, g, RISIKOOBJEKT_MANAGE));
}

export type GroupsChangeCheck = 'ok' | 'forbidden' | 'empty';

/**
 * Prüft eine Änderung der Freigabe. Ein Gruppen-Admin fügt nur Gruppen hinzu
 * oder entfernt nur Gruppen, in denen er selbst das Recht hat — wie die
 * Teilmengenregel beim Vergeben von Rollen. Fremde Gruppen bleiben, wie sie
 * sind. Die letzte Freigabe entfernt nur der Admin, sonst hinge das Objekt
 * ohne Pfleger in der Luft.
 */
export function checkGroupsChange(
  user: PermissionUser,
  before: string[],
  after: string[],
): GroupsChangeCheck {
  if (after.some((g) => !isTenantGroupId(g))) return 'forbidden';
  if (user.isAdmin) return 'ok';
  const prev = new Set(before);
  const next = new Set(after);
  const changed = [...after.filter((g) => !prev.has(g)), ...before.filter((g) => !next.has(g))];
  if (changed.some((g) => !can(user, g, RISIKOOBJEKT_MANAGE))) return 'forbidden';
  if (next.size === 0) return 'empty';
  return 'ok';
}

/**
 * Die Freigabe als Metadatum an der Storage-Datei. Die Storage-Regel kann
 * Firestore nicht verlässlich lesen (gemeinsamer Bucket, getrennte
 * Datenbanken für dev und prod) und prüft deshalb dieses Feld gegen den Claim
 * `groups`.
 */
export function storageGroupsMetadata(groups: string[]): string {
  return [...new Set(groups)].sort().join(',');
}

export interface RisikoObjektInput {
  name: string;
  ortschaft: string;
  adresse: string;
  risikogruppe: string;
  einsatzplanummer: string;
  description: string;
  link: string;
  lat: number;
  lng: number;
}

export type RisikoObjektInputError = 'name' | 'position' | 'link' | 'tooLong';

const MAX_FIELD = 300;
const MAX_DESCRIPTION = 5000;

/** Prüft und bereinigt die Eingabe für ein in der App angelegtes Objekt. */
export function normalizeRisikoObjektInput(
  input: Partial<Record<keyof RisikoObjektInput, unknown>>,
): { ok: true; value: RisikoObjektInput } | { ok: false; error: RisikoObjektInputError } {
  const text = (v: unknown) => (typeof v === 'string' ? v.trim() : typeof v === 'number' ? String(v) : '');
  const value: RisikoObjektInput = {
    name: text(input.name),
    ortschaft: text(input.ortschaft),
    adresse: text(input.adresse),
    risikogruppe: text(input.risikogruppe),
    einsatzplanummer: text(input.einsatzplanummer),
    description: text(input.description),
    link: text(input.link),
    lat: Number(input.lat),
    lng: Number(input.lng),
  };
  if (!value.name) return { ok: false, error: 'name' };
  if (
    !Number.isFinite(value.lat) ||
    !Number.isFinite(value.lng) ||
    Math.abs(value.lat) > 90 ||
    Math.abs(value.lng) > 180
  ) {
    return { ok: false, error: 'position' };
  }
  if (value.link && !/^https?:\/\//i.test(value.link)) return { ok: false, error: 'link' };
  const fields = [value.name, value.ortschaft, value.adresse, value.risikogruppe, value.einsatzplanummer];
  if (fields.some((f) => f.length > MAX_FIELD) || value.description.length > MAX_DESCRIPTION) {
    return { ok: false, error: 'tooLong' };
  }
  if (value.link.length > 2000) return { ok: false, error: 'tooLong' };
  return { ok: true, value };
}

/** Ersetzt den Eintrag mit derselben ID in der Cluster-Liste oder hängt ihn an. */
export function upsertClusterEntry<T extends WgsObject>(entries: T[] | undefined, entry: T): T[] {
  const list = entries ?? [];
  return list.some((e) => e.id === entry.id)
    ? list.map((e) => (e.id === entry.id ? entry : e))
    : [...list, entry];
}

export function removeClusterEntry<T extends WgsObject>(entries: T[] | undefined, id: string): T[] {
  return (entries ?? []).filter((e) => e.id !== id);
}
