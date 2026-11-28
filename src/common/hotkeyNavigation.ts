import type { HotkeyActionId } from './hotkeys';

/**
 * Ziele der Navigations-Kürzel und der Seiten in der globalen Suche.
 *
 * Wie im Menü (`AppDrawer`): Ein Ziel mit `section` führt bei gewähltem
 * Einsatz auf dessen Seite `/einsatz/<id>/<section>`, sonst auf `href`.
 */
export interface NavigationTarget {
  /** Schlüssel im Namespace `drawer` — dieselbe Beschriftung wie im Menü. */
  labelKey: string;
  href: string;
  /** `''` ist die Karte des Einsatzes. */
  section?: string;
}

export const NAVIGATION_HOTKEY_TARGETS = {
  'navigation.map': { labelKey: 'map', href: '/', section: '' },
  'navigation.diary': { labelKey: 'diary', href: '/tagebuch', section: 'tagebuch' },
  'navigation.geschaeftsbuch': {
    labelKey: 'geschaeftsbuch',
    href: '/geschaeftsbuch',
    section: 'geschaeftsbuch',
  },
  'navigation.einsatzmittel': {
    labelKey: 'units',
    href: '/einsatzmittel',
    section: 'einsatzmittel',
  },
  'navigation.einsatzorte': {
    labelKey: 'locations',
    href: '/einsatzorte',
    section: 'einsatzorte',
  },
  'navigation.ebenen': { labelKey: 'layers', href: '/ebenen', section: 'ebenen' },
  'navigation.einsaetze': {
    labelKey: 'firecalls',
    href: '/einsaetze',
    section: 'einsaetze',
  },
} as const satisfies Partial<Record<HotkeyActionId, NavigationTarget>>;

export type NavigationHotkeyId = keyof typeof NAVIGATION_HOTKEY_TARGETS;

/** Seiten, die die globale Suche ohne Suchbegriff und per Name anbietet. */
export const SEARCH_PAGE_TARGETS: readonly NavigationTarget[] = [
  ...Object.values(NAVIGATION_HOTKEY_TARGETS),
  { labelKey: 'details', href: '/', section: 'details' },
  {
    labelKey: 'atemschutzueberwachung',
    href: '/atemschutzueberwachung',
    section: 'atemschutzueberwachung',
  },
  { labelKey: 'atemschutz', href: '/atemschutz', section: 'atemschutz' },
  {
    labelKey: 'loeschwasserversorgung',
    href: '/loeschwasserversorgung',
    section: 'loeschwasserversorgung',
  },
  { labelKey: 'chat', href: '/chat', section: 'chat' },
  { labelKey: 'print', href: '/print', section: 'print' },
  { labelKey: 'sybos', href: '/sybos', section: 'sybos' },
  { labelKey: 'fahrtenbuch', href: '/fahrtenbuch' },
  { labelKey: 'hazmatDatabase', href: '/schadstoff/datenbank' },
  { labelKey: 'documentation', href: '/docs' },
];

export function isNavigationHotkey(id: string): id is NavigationHotkeyId {
  return Object.prototype.hasOwnProperty.call(NAVIGATION_HOTKEY_TARGETS, id);
}

/** Wie `resolveHref` im Menü. */
export function navigationHref(
  target: Pick<NavigationTarget, 'href' | 'section'>,
  firecallId: string | undefined,
): string {
  if (target.section !== undefined && firecallId && firecallId !== 'unknown') {
    return `/einsatz/${firecallId}${target.section ? `/${target.section}` : ''}`;
  }
  return target.href;
}

/** Zeigt die Adresse die Karte (Startseite, `/map` oder Einsatzkarte)? */
export function isMapPath(pathname: string | null | undefined): boolean {
  if (!pathname) return false;
  if (pathname === '/' || pathname === '/map') return true;
  return /^\/einsatz\/[^/]+\/?$/.test(pathname);
}
