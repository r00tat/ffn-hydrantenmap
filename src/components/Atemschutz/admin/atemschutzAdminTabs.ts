export const ATEMSCHUTZ_ADMIN_TABS = ['geraete', 'rechnung', 'stammdaten'] as const;

export type AtemschutzAdminTabKey = (typeof ATEMSCHUTZ_ADMIN_TABS)[number];

/** Der erste Reiter — die Vorgabe, wenn der Parameter fehlt oder unsinnig ist. */
export const DEFAULT_ATEMSCHUTZ_ADMIN_TAB: AtemschutzAdminTabKey = 'geraete';

export function isAtemschutzAdminTabKey(
  value: string | null | undefined,
): value is AtemschutzAdminTabKey {
  return !!value && (ATEMSCHUTZ_ADMIN_TABS as readonly string[]).includes(value);
}

/**
 * Welcher Reiter zu einem Query-Parameter gehört.
 *
 * Wie in `atemschutzTabs.ts`: Ein unbekannter Wert fällt auf den ersten
 * Reiter zurück statt eine leere Seite zu zeigen — der Parameter steht in der
 * URL und damit in jedem weitergegebenen Link.
 */
export function adminTabFromParam(value: string | null | undefined): AtemschutzAdminTabKey {
  return isAtemschutzAdminTabKey(value) ? value : DEFAULT_ATEMSCHUTZ_ADMIN_TAB;
}
