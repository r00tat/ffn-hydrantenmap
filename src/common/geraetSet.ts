/**
 * Sets für Geräte und Material — reine Logik, von Dialogen und Server
 * Actions gemeinsam genutzt. Ohne Firestore, damit die Regeln (Code-
 * Eindeutigkeit, „Set gewinnt", Lagerort mit Rückfall) ohne Mocks testbar
 * sind. Hintergrund: docs/geraete-lager.md, Abschnitt „Sets".
 */
import {
  einsatzArtFor,
  geraetCodesOf,
  normalizeCode,
  pickDefaultBestand,
  usesHours,
} from '../components/Geraete/einsatz/geraetEinsatzLogic';
import {
  isValidMenge,
  type Geraet,
  type GeraetBestand,
  type GeraetEinsatz,
  type GeraetEinsatzArt,
  type GeraetSet,
  type GeraetSetItem,
} from './geraet';

/** Der Sybos-Material-Typ, an den sich ein Set binden lässt. */
export const SET_ARTIKEL_TYP = 'Set-Artikel';

/** Was Dialog und Server Action zum Speichern eines Sets kennen. */
export interface GeraetSetInput {
  id?: string;
  name: string;
  sybosSetArtikelId?: string;
  codes: string[];
  inhalt: GeraetSetItem[];
  active: boolean;
  bemerkung?: string;
}

export type GeraetSetError =
  | { code: 'nameMissing' }
  | { code: 'noItems' }
  | { code: 'notSetArtikel' }
  | { code: 'unknownItem'; geraetId: string }
  | { code: 'duplicateItem'; geraetId: string }
  | { code: 'setArtikelAsItem'; geraetId: string }
  | { code: 'invalidMenge'; geraetId: string }
  | { code: 'invalidBestand'; geraetId: string }
  | { code: 'bestandNotConsumable'; geraetId: string }
  | { code: 'codeCollision'; value: string; kind: 'geraet' | 'set'; name: string };

export interface GeraetSetContext {
  geraete: Geraet[];
  sets: GeraetSet[];
  /** Nicht archivierte Bestände der Gruppe. */
  bestaende: GeraetBestand[];
}

/**
 * Codes, wie sie gespeichert werden: getrimmt, Leerzeichen zusammengefasst,
 * ohne Dubletten — verglichen wie beim Scan (`normalizeCode`).
 */
export function normalizeSetCodes(codes: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const raw of codes) {
    const value = (raw ?? '').trim().replace(/\s+/g, ' ');
    const key = normalizeCode(value);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    result.push(value);
  }
  return result;
}

/**
 * Alle Codes, über die ein Set gefunden wird: die eigenen und die des
 * gebundenen Set-Artikels — die gelten, ohne eingetragen zu sein.
 */
export function setCodesOf(
  set: Pick<GeraetSet, 'codes' | 'sybosSetArtikelId'>,
  geraetById: Map<string, Geraet>,
): string[] {
  const own = (set.codes ?? []).map((c) => normalizeCode(c)).filter(Boolean);
  const artikel = set.sybosSetArtikelId ? geraetById.get(set.sybosSetArtikelId) : undefined;
  return [...new Set([...own, ...(artikel ? geraetCodesOf(artikel) : [])])];
}

/**
 * Prüft ein Set vor dem Speichern — im Dialog für die Anzeige am Feld, in
 * der Server Action gegen den Stand der Gruppe.
 *
 * Ein Code darf weder an einem Artikel noch an einem anderen aktiven Set
 * stehen, sonst wäre der Scan mehrdeutig. Ausgenommen sind die Codes des
 * eigenen gebundenen Set-Artikels: Für sie gewinnt ohnehin das Set.
 */
export function validateGeraetSet(
  input: GeraetSetInput,
  { geraete, sets, bestaende }: GeraetSetContext,
): GeraetSetError[] {
  const errors: GeraetSetError[] = [];
  const geraetById = new Map(geraete.map((g) => [g.id, g]));
  if (!input.name?.trim()) errors.push({ code: 'nameMissing' });
  if (!input.inhalt?.length) errors.push({ code: 'noItems' });

  const artikelId = input.sybosSetArtikelId || undefined;
  const artikel = artikelId ? geraetById.get(artikelId) : undefined;
  if (artikelId && artikel?.materialTyp !== SET_ARTIKEL_TYP) {
    errors.push({ code: 'notSetArtikel' });
  }

  const seen = new Set<string>();
  for (const item of input.inhalt ?? []) {
    const { geraetId } = item;
    const g = geraetById.get(geraetId);
    if (!g) {
      errors.push({ code: 'unknownItem', geraetId });
      continue;
    }
    if (seen.has(geraetId)) errors.push({ code: 'duplicateItem', geraetId });
    seen.add(geraetId);
    if (geraetId === artikelId) errors.push({ code: 'setArtikelAsItem', geraetId });
    if (item.menge !== undefined && (!isValidMenge(item.menge) || item.menge <= 0)) {
      errors.push({ code: 'invalidMenge', geraetId });
    }
    if (item.bestandId) {
      if (!g.verbrauchsmaterial) {
        errors.push({ code: 'bestandNotConsumable', geraetId });
      } else if (!bestaende.some((b) => b.id === item.bestandId && b.geraetId === geraetId)) {
        errors.push({ code: 'invalidBestand', geraetId });
      }
    }
  }

  const ownArtikelCodes = new Set(artikel ? geraetCodesOf(artikel) : []);
  for (const value of normalizeSetCodes(input.codes ?? [])) {
    const key = normalizeCode(value);
    if (ownArtikelCodes.has(key)) continue;
    const g = geraete.find((x) => geraetCodesOf(x).includes(key));
    if (g) {
      errors.push({ code: 'codeCollision', value, kind: 'geraet', name: g.bezeichnung });
      continue;
    }
    const other = sets.find(
      (s) => s.id !== input.id && s.active !== false && setCodesOf(s, geraetById).includes(key),
    );
    if (other) errors.push({ code: 'codeCollision', value, kind: 'set', name: other.name });
  }
  return errors;
}

/** Ein Treffer der Suche oder des Scans im Einsatz-Dialog. */
export type EinsatzPick = { kind: 'geraet'; geraet: Geraet } | { kind: 'set'; set: GeraetSet };

/**
 * Exakte Treffer eines Codes in Artikeln und aktiven Sets. Gehört der Code
 * zu einem Set-Artikel, an den ein aktives Set gebunden ist, gewinnt das Set:
 * Wer die Kiste scannt, will das Set mit seinem Inhalt.
 */
export function findByCode(
  code: string,
  { geraete, sets }: Pick<GeraetSetContext, 'geraete' | 'sets'>,
): EinsatzPick[] {
  const wanted = normalizeCode(code);
  if (!wanted) return [];
  const geraetById = new Map(geraete.map((g) => [g.id, g]));
  const setHits = sets.filter(
    (s) => s.active !== false && setCodesOf(s, geraetById).includes(wanted),
  );
  const shadowed = new Set(setHits.map((s) => s.sybosSetArtikelId).filter(Boolean));
  const geraetHits = geraete.filter(
    (g) => g.active !== false && !shadowed.has(g.id) && geraetCodesOf(g).includes(wanted),
  );
  return [
    ...geraetHits.map((geraet) => ({ kind: 'geraet' as const, geraet })),
    ...setHits.map((set) => ({ kind: 'set' as const, set })),
  ];
}

/** Aktive Sets, deren Name oder Codes alle Suchwörter enthalten. */
export function searchSets(sets: GeraetSet[], text: string, limit = 20): GeraetSet[] {
  const words = normalizeCode(text).split(' ').filter(Boolean);
  return sets
    .filter((s) => s.active !== false)
    .filter((s) => {
      const haystack = [s.name, ...(s.codes ?? [])].map((v) => normalizeCode(v)).join(' ');
      return words.every((w) => haystack.includes(w));
    })
    .slice(0, limit);
}

/** Eine Zeile, die beim Zuordnen eines Sets im Einsatz entsteht. */
export interface SetEinsatzRow {
  /** Beim Set-Artikel als Gerät in Stück zurechtgelegt. */
  geraet: Geraet;
  art: GeraetEinsatzArt;
  menge?: number;
  bestandId?: string;
  fromSetArtikel: boolean;
}

export type SetSkipReason = 'missing' | 'inactive' | 'noBestand';

export interface SetSkipped {
  geraetId: string;
  /** Bezeichnung, wenn der Artikel noch existiert. */
  name?: string;
  reason: SetSkipReason;
}

export interface SetExpandContext {
  geraetById: Map<string, Geraet>;
  bestaendeByGeraet: Map<string, GeraetBestand[]>;
  /** Wie bei `pickDefaultBestand`: Einsatzmittel und zugeordnete Container. */
  vehicleNames: string[];
  containerIds: string[];
}

/**
 * Die Einträge eines Sets für den Einsatz: zuerst der gebundene Set-Artikel
 * (zugeordnet, Menge 1), dann die Inhalte in Set-Reihenfolge. Verbrauch geht
 * vom festen Lagerort ab, fehlt der, vom vorbelegten (`pickDefaultBestand`).
 * Was sich nicht anlegen lässt, steht mit Grund in `skipped`.
 */
export function expandSetForEinsatz(
  set: GeraetSet,
  ctx: SetExpandContext,
): { rows: SetEinsatzRow[]; skipped: SetSkipped[] } {
  const rows: SetEinsatzRow[] = [];
  const skipped: SetSkipped[] = [];

  const lookup = (geraetId: string): Geraet | undefined => {
    const g = ctx.geraetById.get(geraetId);
    if (!g) {
      skipped.push({ geraetId, reason: 'missing' });
      return undefined;
    }
    if (g.active === false) {
      skipped.push({ geraetId, name: g.bezeichnung, reason: 'inactive' });
      return undefined;
    }
    return g;
  };

  if (set.sybosSetArtikelId) {
    const artikel = lookup(set.sybosSetArtikelId);
    if (artikel) {
      rows.push({
        geraet: { ...artikel, verbrauchsmaterial: false, einheitVerwendungsnachweis: 'stk' },
        art: 'zugeordnet',
        menge: 1,
        fromSetArtikel: true,
      });
    }
  }

  for (const item of set.inhalt ?? []) {
    const g = lookup(item.geraetId);
    if (!g) continue;
    const art = einsatzArtFor(g);
    let bestandId: string | undefined;
    if (art === 'verbraucht') {
      const bestaende = ctx.bestaendeByGeraet.get(g.id) ?? [];
      const fixed = item.bestandId ? bestaende.find((b) => b.id === item.bestandId) : undefined;
      const chosen = fixed ?? pickDefaultBestand(bestaende, ctx.vehicleNames, ctx.containerIds);
      if (!chosen) {
        skipped.push({ geraetId: g.id, name: g.bezeichnung, reason: 'noBestand' });
        continue;
      }
      bestandId = chosen.id;
    }
    rows.push({
      geraet: g,
      art,
      menge: usesHours(g) ? undefined : (item.menge ?? 1),
      bestandId,
      fromSetArtikel: false,
    });
  }
  return { rows, skipped };
}

export type EinsatzListItem =
  | { kind: 'entry'; entry: GeraetEinsatz }
  | { kind: 'set'; zuordnungId: string; name: string; entries: GeraetEinsatz[] };

/**
 * Die Liste im Einsatz: Einträge derselben `setZuordnungId` stehen unter
 * einer Überschrift an der Stelle des ersten Eintrags.
 */
export function groupEntriesBySet(entries: GeraetEinsatz[]): EinsatzListItem[] {
  const result: EinsatzListItem[] = [];
  const groups = new Map<string, Extract<EinsatzListItem, { kind: 'set' }>>();
  for (const entry of entries) {
    const id = entry.setZuordnungId;
    if (!id) {
      result.push({ kind: 'entry', entry });
      continue;
    }
    const group = groups.get(id);
    if (group) {
      group.entries.push(entry);
      continue;
    }
    const created = {
      kind: 'set' as const,
      zuordnungId: id,
      name: entry.setName ?? '',
      entries: [entry],
    };
    groups.set(id, created);
    result.push(created);
  }
  return result;
}
