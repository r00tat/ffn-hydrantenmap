/**
 * Routen, die ohne Anmeldung gerendert werden. `AuthorizationApp` in
 * `AppProviders` ersetzt `children` sonst durch die Login-Oberfläche, egal was
 * die Route selbst tut.
 *
 * Der abschließende Schrägstrich ist Absicht: nur die Unterseiten mit Token
 * sind öffentlich, nicht ein Präfix wie `/fahrtenbuch`.
 */
export const PUBLIC_ROUTE_PREFIXES: string[] = ['/fahrtenbuch/teilen/'];

export function isPublicRoute(pathname?: string | null): boolean {
  if (!pathname) return false;
  return PUBLIC_ROUTE_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}
