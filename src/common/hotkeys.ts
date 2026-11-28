/**
 * Tastenkürzel: Katalog, Schreibweise und Abgleich mit Tastatur-Ereignissen.
 *
 * Reine Logik ohne React und ohne DOM, damit Abgleich und Konflikterkennung
 * ohne Browser testbar sind. Hintergrund in docs/tastenkuerzel.md.
 *
 * **Schreibweise:** Modifikatoren in fester Reihenfolge `Ctrl+Alt+Shift+Meta`,
 * dann die Taste. Buchstaben groß (`M`), Satzzeichen wie getippt (`/`, `?`),
 * benannte Tasten wie in `KeyboardEvent.key` (`Escape`, `F1`).
 */

export type HotkeyGroup =
  | 'general'
  | 'bugReport'
  | 'navigation'
  | 'map'
  | 'documents';

export interface HotkeyAction {
  /** Zugleich der Message-Schlüssel unter `hotkeys.actions`. */
  id: string;
  group: HotkeyGroup;
  defaultBinding: string;
  /**
   * Feuert auch, solange ein modaler Dialog offen ist. Nur für Kürzel, die
   * genau dafür da sind — den Bug-Report über einem Dialog, der beim Klick
   * ins Menü verschwände.
   */
  whileDialogOpen?: boolean;
  /** Feuert auch, wenn der Fokus in einem Eingabefeld steht. */
  allowInInputs?: boolean;
}

export const HOTKEY_ACTIONS = [
  // Allgemein
  { id: 'general.search', group: 'general', defaultBinding: '/' },
  { id: 'general.help', group: 'general', defaultBinding: '?' },

  // Bug-Report: mit Modifikatoren, damit sie auch in Eingabefeldern und über
  // offenen Dialogen gehen, ohne ein Zeichen zu verschlucken.
  {
    id: 'bugReport.open',
    group: 'bugReport',
    defaultBinding: 'Alt+B',
    whileDialogOpen: true,
    allowInInputs: true,
  },
  {
    id: 'bugReport.region',
    group: 'bugReport',
    defaultBinding: 'Alt+Shift+B',
    whileDialogOpen: true,
    allowInInputs: true,
  },

  // Einsatz-Dokumentation
  { id: 'documents.diary', group: 'documents', defaultBinding: 'T' },
  { id: 'documents.geschaeftsbuch', group: 'documents', defaultBinding: 'G' },

  // Karte
  { id: 'map.marker', group: 'map', defaultBinding: 'M' },
  { id: 'map.vehicle', group: 'map', defaultBinding: 'F' },
  { id: 'map.connection', group: 'map', defaultBinding: 'L' },
  { id: 'map.area', group: 'map', defaultBinding: 'A' },
  { id: 'map.location', group: 'map', defaultBinding: 'O' },
  { id: 'map.addElement', group: 'map', defaultBinding: 'N' },
  { id: 'map.toggleEdit', group: 'map', defaultBinding: 'E' },

  // Navigation
  { id: 'navigation.map', group: 'navigation', defaultBinding: 'Shift+K' },
  { id: 'navigation.diary', group: 'navigation', defaultBinding: 'Shift+T' },
  {
    id: 'navigation.geschaeftsbuch',
    group: 'navigation',
    defaultBinding: 'Shift+G',
  },
  {
    id: 'navigation.einsatzmittel',
    group: 'navigation',
    defaultBinding: 'Shift+E',
  },
  {
    id: 'navigation.einsatzorte',
    group: 'navigation',
    defaultBinding: 'Shift+O',
  },
  { id: 'navigation.ebenen', group: 'navigation', defaultBinding: 'Shift+L' },
  {
    id: 'navigation.einsaetze',
    group: 'navigation',
    defaultBinding: 'Shift+H',
  },
] as const satisfies readonly HotkeyAction[];

export type HotkeyActionId = (typeof HOTKEY_ACTIONS)[number]['id'];

export const HOTKEY_GROUPS: readonly HotkeyGroup[] = [
  'general',
  'bugReport',
  'map',
  'documents',
  'navigation',
];

/** `null` = vom Benutzer abgeschaltet. */
export type HotkeyBindings = Record<HotkeyActionId, string | null>;
export type HotkeyOverrides = Partial<Record<string, string | null>>;

const ACTIONS_BY_ID = new Map<string, HotkeyAction>(
  HOTKEY_ACTIONS.map((action) => [action.id, action]),
);

export function getHotkeyAction(id: string): HotkeyAction | undefined {
  return ACTIONS_BY_ID.get(id);
}

export function isHotkeyActionId(id: string): id is HotkeyActionId {
  return ACTIONS_BY_ID.has(id);
}

export interface ParsedBinding {
  /** Kleinbuchstabe, Satzzeichen oder benannte Taste (`Escape`, `F1`). */
  key: string;
  alt: boolean;
  ctrl: boolean;
  meta: boolean;
  shift: boolean;
}

const MODIFIER_ALIASES: Record<string, keyof Omit<ParsedBinding, 'key'>> = {
  alt: 'alt',
  option: 'alt',
  ctrl: 'ctrl',
  control: 'ctrl',
  meta: 'meta',
  cmd: 'meta',
  command: 'meta',
  shift: 'shift',
};

const MODIFIER_KEYS = new Set(['Alt', 'Control', 'Meta', 'Shift', 'AltGraph']);

/** Ein einzelner Buchstabe oder eine Ziffer — Umschalt zählt bei ihnen. */
function isAlphanumeric(key: string): boolean {
  return /^[a-z0-9]$/.test(key);
}

/**
 * Ein druckbares Zeichen, das kein Buchstabe und keine Ziffer ist.
 * Umschalt wird dafür ignoriert: `/` ist auf der deutschen Tastatur
 * Umschalt+7, auf der US-Tastatur eine eigene Taste.
 */
function isPunctuation(key: string): boolean {
  return key.length === 1 && !isAlphanumeric(key) && key !== ' ';
}

function normalizeKeyName(raw: string): string {
  if (raw.length === 1) return raw.toLowerCase();
  const lower = raw.toLowerCase();
  if (lower === 'esc') return 'Escape';
  if (lower === 'space') return ' ';
  // F1, Escape, ArrowUp, … in der Schreibweise von KeyboardEvent.key
  return raw.charAt(0).toUpperCase() + raw.slice(1);
}

export function parseBinding(binding: string | null | undefined): ParsedBinding | null {
  if (!binding) return null;
  const trimmed = binding.trim();
  if (!trimmed) return null;

  // "+" als Taste selbst: "Shift++" bzw. "+"
  const parts =
    trimmed === '+'
      ? ['+']
      : trimmed.endsWith('++')
        ? [...trimmed.slice(0, -2).split('+'), '+']
        : trimmed.split('+');

  const parsed: ParsedBinding = {
    key: '',
    alt: false,
    ctrl: false,
    meta: false,
    shift: false,
  };

  for (let i = 0; i < parts.length; i += 1) {
    const part = parts[i].trim();
    const isLast = i === parts.length - 1;
    const modifier = MODIFIER_ALIASES[part.toLowerCase()];
    if (!isLast) {
      if (!modifier) return null;
      parsed[modifier] = true;
      continue;
    }
    if (!part || modifier) return null;
    parsed.key = normalizeKeyName(part);
  }

  return parsed.key ? parsed : null;
}

function serialize(parsed: ParsedBinding): string {
  const parts: string[] = [];
  if (parsed.ctrl) parts.push('Ctrl');
  if (parsed.alt) parts.push('Alt');
  if (parsed.shift) parts.push('Shift');
  if (parsed.meta) parts.push('Meta');
  const key =
    parsed.key === ' '
      ? 'Space'
      : parsed.key.length === 1
        ? parsed.key.toUpperCase()
        : parsed.key;
  parts.push(key);
  return parts.join('+');
}

/** Kanonische Schreibweise, `null` wenn sie sich nicht lesen lässt. */
export function normalizeBinding(binding: string | null | undefined): string | null {
  const parsed = parseBinding(binding);
  return parsed ? serialize(parsed) : null;
}

const MAC_SYMBOLS: Record<string, string> = {
  Ctrl: '⌃',
  Alt: '⌥',
  Shift: '⇧',
  Meta: '⌘',
};

/** Anzeige-Schreibweise, auf dem Mac mit den üblichen Symbolen. */
export function formatBinding(
  binding: string | null | undefined,
  { mac = false }: { mac?: boolean } = {},
): string {
  const normalized = normalizeBinding(binding);
  if (!normalized) return '';
  if (!mac) return normalized;
  const parts = normalized === '+' ? ['+'] : normalized.split('+');
  const key = parts.pop() ?? '';
  return parts.map((part) => MAC_SYMBOLS[part] ?? part).join('') + key;
}

export type HotkeyKeyEvent = Pick<
  KeyboardEvent,
  'key' | 'code' | 'altKey' | 'ctrlKey' | 'metaKey' | 'shiftKey'
>;

/**
 * Die Taste eines Ereignisses. Mit Alt (Option) liefert macOS ein anderes
 * Zeichen (`Option+B` = `∫`); dann zählt die physische Taste aus `code`.
 */
function eventKey(event: HotkeyKeyEvent): string {
  if (event.altKey || event.ctrlKey || event.metaKey) {
    const letter = /^Key([A-Z])$/.exec(event.code ?? '');
    if (letter) return letter[1].toLowerCase();
    const digit = /^Digit(\d)$/.exec(event.code ?? '');
    if (digit) return digit[1];
  }
  const raw = event.key ?? '';
  return raw.length === 1 ? raw.toLowerCase() : raw;
}

export function matchesBinding(
  event: HotkeyKeyEvent,
  binding: string | null | undefined,
): boolean {
  const parsed = parseBinding(binding);
  if (!parsed) return false;
  if (eventKey(event) !== parsed.key) return false;
  if (event.altKey !== parsed.alt) return false;
  if (event.ctrlKey !== parsed.ctrl) return false;
  if (event.metaKey !== parsed.meta) return false;
  if (isPunctuation(parsed.key)) return true;
  return event.shiftKey === parsed.shift;
}

/** Für die Aufnahme eines neuen Kürzels auf der Einstellungsseite. */
export function bindingFromEvent(event: HotkeyKeyEvent): string | null {
  if (MODIFIER_KEYS.has(event.key)) return null;
  const key = eventKey(event);
  if (!key || key === 'Unidentified' || key === 'Dead') return null;
  return serialize({
    key,
    alt: event.altKey,
    ctrl: event.ctrlKey,
    meta: event.metaKey,
    shift: isPunctuation(key) ? false : event.shiftKey,
  });
}

/**
 * Vorbelegung plus Änderungen des Benutzers. Unbekannte Aktionen fallen weg,
 * eine unlesbare Änderung lässt die Vorbelegung stehen.
 */
export function resolveBindings(overrides: HotkeyOverrides): HotkeyBindings {
  const result = {} as HotkeyBindings;
  for (const action of HOTKEY_ACTIONS) {
    const id = action.id as HotkeyActionId;
    if (Object.prototype.hasOwnProperty.call(overrides, id)) {
      const override = overrides[id];
      if (override === null) {
        result[id] = null;
        continue;
      }
      const normalized = normalizeBinding(override);
      if (normalized) {
        result[id] = normalized;
        continue;
      }
    }
    result[id] = action.defaultBinding;
  }
  return result;
}

export interface HotkeyConflict {
  binding: string;
  actions: HotkeyActionId[];
}

/** Kürzel, die mehr als einer Aktion zugeordnet sind. */
export function findConflicts(bindings: HotkeyBindings): HotkeyConflict[] {
  const byBinding = new Map<string, HotkeyActionId[]>();
  for (const action of HOTKEY_ACTIONS) {
    const id = action.id as HotkeyActionId;
    const binding = normalizeBinding(bindings[id]);
    if (!binding) continue;
    byBinding.set(binding, [...(byBinding.get(binding) ?? []), id]);
  }
  return [...byBinding.entries()]
    .filter(([, actions]) => actions.length > 1)
    .map(([binding, actions]) => ({ binding, actions }));
}
