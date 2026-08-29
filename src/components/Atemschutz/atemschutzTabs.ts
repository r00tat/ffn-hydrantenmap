export const ATEMSCHUTZ_TABS = [
  'fuellprotokoll',
  'trupps',
  'ausruestung',
] as const;

export type AtemschutzTabKey = (typeof ATEMSCHUTZ_TABS)[number];

/** Der erste Reiter — die Vorgabe, wenn der Parameter fehlt oder unsinnig ist. */
export const DEFAULT_ATEMSCHUTZ_TAB: AtemschutzTabKey = 'fuellprotokoll';

export function isAtemschutzTabKey(
  value: string | null | undefined,
): value is AtemschutzTabKey {
  return !!value && (ATEMSCHUTZ_TABS as readonly string[]).includes(value);
}

/**
 * Welcher Reiter zu einem Query-Parameter gehört.
 *
 * Ein unbekannter Wert fällt auf den ersten Reiter zurück statt eine leere
 * Seite zu zeigen: Der Parameter steht in der URL und damit in jedem
 * weitergegebenen Link — ein Tippfehler darin darf die Seite nicht leeren.
 */
export function tabFromParam(
  value: string | null | undefined,
): AtemschutzTabKey {
  return isAtemschutzTabKey(value) ? value : DEFAULT_ATEMSCHUTZ_TAB;
}
