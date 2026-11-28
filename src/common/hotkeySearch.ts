/**
 * Globale Suche (Tastenkürzel `/`): Einträge bauen, filtern und reihen.
 *
 * Reine Logik ohne React, damit die Reihung ohne Browser testbar ist. Der
 * Dialog (`components/hotkeys/HotkeySearchDialog.tsx`) sammelt die Daten und
 * führt die Auswahl aus. Hintergrund in docs/tastenkuerzel.md.
 */

export type SearchEntryKind =
  | 'page'
  | 'item'
  | 'location'
  | 'diary'
  | 'gb'
  | 'address';

export interface SearchEntry {
  /** Eindeutig über alle Arten, etwa `item:<id>`. */
  key: string;
  kind: SearchEntryKind;
  title: string;
  subtitle?: string;
  /** Weitere Texte, in denen gesucht wird, ohne dass sie angezeigt werden. */
  keywords?: string[];
}

/**
 * Kleinbuchstaben ohne Akzente; „ß" wird zu „ss", damit „strasse" die
 * „Straße" findet.
 */
export function normalizeSearchText(text: string | undefined | null): string {
  if (!text) return '';
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/ß/g, 'ss')
    .trim();
}

function tokenize(query: string): string[] {
  return normalizeSearchText(query).split(/\s+/).filter(Boolean);
}

/**
 * Punkte eines Eintrags für die Suchbegriffe, `null` wenn ein Begriff
 * nirgends vorkommt. Alle Begriffe müssen passen (UND), so engt jedes weitere
 * Wort die Liste ein.
 */
export function scoreSearchEntry(
  entry: SearchEntry,
  query: string,
): number | null {
  const tokens = tokenize(query);
  if (tokens.length === 0) return 0;

  const title = normalizeSearchText(entry.title);
  const titleWords = title.split(/[\s,.;:()/\-–]+/).filter(Boolean);
  const rest = [entry.subtitle, ...(entry.keywords ?? [])]
    .map(normalizeSearchText)
    .join(' ');

  let score = 0;
  for (const token of tokens) {
    if (titleWords.some((word) => word.startsWith(token))) {
      score += 30;
    } else if (title.includes(token)) {
      score += 20;
    } else if (rest.includes(token)) {
      score += 8;
    } else {
      return null;
    }
  }

  const whole = tokens.join(' ');
  if (title === whole) score += 100;
  else if (title.startsWith(whole)) score += 50;

  return score;
}

/**
 * Die passenden Einträge, bester Treffer zuerst; bei gleichen Punkten bleibt
 * die Reihenfolge der Eingabe. Ohne Suchbegriff gibt es nur die Seiten —
 * eine Liste aller Elemente eines großen Einsatzes hilft niemandem.
 */
export function rankSearchEntries<T extends SearchEntry>(
  entries: readonly T[],
  query: string,
  limit = 50,
): T[] {
  if (tokenize(query).length === 0) {
    return entries.filter((entry) => entry.kind === 'page').slice(0, limit);
  }
  return entries
    .map((entry, index) => ({ entry, index, score: scoreSearchEntry(entry, query) }))
    .filter((scored): scored is { entry: T; index: number; score: number } =>
      scored.score !== null,
    )
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .slice(0, limit)
    .map((scored) => scored.entry);
}

/** Die erste nicht leere Zeile, gekürzt — für die zweite Zeile im Treffer. */
export function firstLine(text: string | undefined, max = 80): string {
  const line = (text ?? '')
    .split('\n')
    .map((part) => part.trim())
    .find(Boolean);
  if (!line) return '';
  return line.length > max ? `${line.slice(0, max - 1)}…` : line;
}

/** Felder, die die Suche an einem Element liest. */
export interface SearchableItem {
  id?: string;
  type: string;
  name?: string;
  beschreibung?: string;
  deleted?: boolean;
  nummer?: number;
  von?: string;
  an?: string;
}

/** Typen, die die Suche nicht als Kartenelement anbietet. */
const NOT_MAP_ITEMS = new Set(['diary', 'gb', 'layer', 'fallback', 'spectrum']);

/** Elemente der Karte: Name, Typ und Beschreibung. */
export function itemSearchEntries<T extends SearchableItem>(
  items: readonly T[],
  typeLabel: (type: string) => string,
): (SearchEntry & { item: T })[] {
  return items
    .filter((item) => item.id && !item.deleted && !NOT_MAP_ITEMS.has(item.type))
    .map((item) => {
      const label = typeLabel(item.type);
      const description = firstLine(item.beschreibung);
      return {
        key: `item:${item.id}`,
        kind: 'item' as const,
        title: item.name?.trim() || label,
        subtitle: description ? `${label} · ${description}` : label,
        keywords: [item.beschreibung ?? ''],
        item,
      };
    });
}

/** Einträge aus Einsatztagebuch (`diary`) oder Geschäftsbuch (`gb`). */
export function documentSearchEntries<T extends SearchableItem>(
  items: readonly T[],
  kind: 'diary' | 'gb',
): (SearchEntry & { item: T })[] {
  return items
    .filter((item) => item.id && !item.deleted && item.type === kind)
    .map((item) => {
      const fromTo = [item.von, item.an].filter(Boolean).join(' → ');
      const description = firstLine(item.beschreibung);
      const number = item.nummer !== undefined ? `${item.nummer} ` : '';
      return {
        key: `${kind}:${item.id}`,
        kind,
        title: `${number}${firstLine(item.name) || description}`.trim(),
        subtitle: [fromTo, description].filter(Boolean).join(' · '),
        keywords: [item.beschreibung ?? '', item.von ?? '', item.an ?? ''],
        item,
      };
    });
}

/** Felder eines Einsatzorts, die die Suche liest. */
export interface SearchableLocation {
  id?: string;
  name?: string;
  street?: string;
  number?: string;
  city?: string;
  description?: string;
  info?: string;
  deleted?: boolean;
}

/** Einsatzorte: eigene Sammlung, gesucht nach Name, Adresse und Text. */
export function locationSearchEntries<T extends SearchableLocation>(
  locations: readonly T[],
  label: string,
): (SearchEntry & { location: T })[] {
  return locations
    .filter((location) => location.id && !location.deleted)
    .map((location) => {
      const address = [
        [location.street, location.number].filter(Boolean).join(' '),
        location.city,
      ]
        .filter(Boolean)
        .join(', ');
      return {
        key: `location:${location.id}`,
        kind: 'location' as const,
        title: location.name?.trim() || address || label,
        subtitle: address ? `${label} · ${address}` : label,
        keywords: [location.description ?? '', location.info ?? ''],
        location,
      };
    });
}
