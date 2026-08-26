/**
 * Scopes des MCP-Zugangs.
 *
 * Ein Scope **schneidet nur ein, er erweitert nie**. Die effektiven Rechte
 * eines Tool-Calls sind immer die Schnittmenge aus dem Scope des Tokens und
 * den Rechten des Benutzers aus `user`/`groups`. Ein Token mit
 * `einsatz:write` für jemanden ohne passende Gruppenzugehörigkeit darf
 * nichts — die bestehenden Guards (`verifyUserAuthorizedForFirecall`) laufen
 * unverändert zusätzlich.
 */

export const MCP_SCOPES = [
  /** Einsätze, Items, Ebenen, Tagebuch, Geschäftsbuch lesen. */
  'einsatz:read',
  /** Items anlegen/ändern/löschen, Tagebuch- und GB-Einträge schreiben. */
  'einsatz:write',
  /** Hydranten, Wasserversorgung, Löschwasser-Suche. */
  'hydranten:read',
  /** Reine Rechner-Tools, kein Datenzugriff. */
  'berechnung',
] as const;

export type McpScope = (typeof MCP_SCOPES)[number];

/**
 * Was ein Client bekommt, der bei der Autorisierung keinen `scope` angibt.
 *
 * Bewusst ohne `einsatz:write`: Wer schreiben will, muss es verlangen, und der
 * Consent-Screen benennt es dann ausdrücklich.
 */
export const DEFAULT_MCP_SCOPES: McpScope[] = [
  'einsatz:read',
  'hydranten:read',
  'berechnung',
];

export function isMcpScope(value: string): value is McpScope {
  return (MCP_SCOPES as readonly string[]).includes(value);
}

/**
 * Einen `scope`-Parameter (RFC 6749: leerzeichengetrennt) in bekannte Scopes
 * zerlegen. Unbekannte Werte fallen weg, Duplikate werden entfernt und die
 * Reihenfolge folgt `MCP_SCOPES` — damit ist die Zeichenkette kanonisch und
 * ein gespeicherter Consent lässt sich stumpf vergleichen.
 */
export function parseScopes(scope?: string | null): McpScope[] {
  const requested = new Set(
    (scope || '')
      .split(/\s+/)
      .map((value) => value.trim())
      .filter(Boolean),
  );
  return MCP_SCOPES.filter((known) => requested.has(known));
}

/** Wie `parseScopes`, meldet aber zusätzlich die unbekannten Werte. */
export function parseScopesStrict(scope?: string | null): {
  scopes: McpScope[];
  unknown: string[];
} {
  const requested = (scope || '')
    .split(/\s+/)
    .map((value) => value.trim())
    .filter(Boolean);
  return {
    scopes: MCP_SCOPES.filter((known) => requested.includes(known)),
    unknown: requested.filter((value) => !isMcpScope(value)),
  };
}

/** Kanonische, leerzeichengetrennte Darstellung für `scope`-Claims. */
export function formatScopes(scopes: readonly McpScope[]): string {
  return MCP_SCOPES.filter((known) => scopes.includes(known)).join(' ');
}

/** Deckt `granted` alle `required` ab? */
export function hasScopes(
  granted: readonly string[],
  required: readonly McpScope[],
): boolean {
  return required.every((scope) => granted.includes(scope));
}

/** Deckt `granted` mindestens einen der `required` ab? */
export function hasAnyScope(
  granted: readonly string[],
  required: readonly McpScope[],
): boolean {
  return required.some((scope) => granted.includes(scope));
}

/**
 * Ist der zweite Satz eine Teilmenge des ersten? Der gespeicherte Consent
 * gilt nur, wenn er die neu verlangten Scopes vollständig abdeckt.
 */
export function coversScopes(
  granted: readonly McpScope[],
  requested: readonly McpScope[],
): boolean {
  return requested.every((scope) => granted.includes(scope));
}
