import { FIRECALL_SECTION_NAMES, type FirecallSectionName } from './appShellRoutes';

/**
 * Wechsel zwischen den Seiten eines Einsatzes ohne Neuladen.
 *
 * Karte und Abschnitte unter `/einsatz/<id>[/<abschnitt>]` rendern dieselbe
 * Client-Komponente (`FirecallView`), die den Abschnitt aus der Adresse liest.
 * Ein Wechsel innerhalb desselben Einsatzes braucht deshalb keinen Server und
 * keinen Cache: `FirecallLink` setzt nur die Adresse per `history.pushState`.
 * Seiten mit eigener Route (Kostenersatz, Schadstoff) gehen den normalen Weg.
 */

export interface FirecallSectionPath {
  firecallId: string;
  /** `''` ist die Karte. */
  section: FirecallSectionName | '';
}

const FIRECALL_SECTION_PATH = /^\/einsatz\/([^/]+)(?:\/([^/]+))?\/?$/;

export function isFirecallSectionName(value: string): value is FirecallSectionName {
  return (FIRECALL_SECTION_NAMES as readonly string[]).includes(value);
}

export function parseFirecallSectionPath(pathname: string): FirecallSectionPath | null {
  const match = FIRECALL_SECTION_PATH.exec(pathname);
  if (!match) return null;
  const section = match[2] ?? '';
  if (section !== '' && !isFirecallSectionName(section)) return null;
  return { firecallId: decodeURIComponent(match[1]), section };
}

/**
 * Ob `href` von `currentPathname` aus ohne Router erreichbar ist: derselbe
 * Einsatz, ein anderer Abschnitt, keine Query und kein Anker.
 */
export function canNavigateInPlace(
  currentPathname: string,
  href: string,
  origin = 'http://localhost',
): boolean {
  let target: URL;
  try {
    target = new URL(href, origin);
  } catch {
    return false;
  }
  if (target.origin !== new URL(origin).origin || target.search || target.hash) {
    return false;
  }
  const from = parseFirecallSectionPath(currentPathname);
  const to = parseFirecallSectionPath(target.pathname);
  return (
    from !== null &&
    to !== null &&
    from.firecallId === to.firecallId &&
    from.section !== to.section
  );
}
