/**
 * Scope → Übersetzungsschlüssel im Namespace `oauthConsent`.
 *
 * Eigene Datei, weil zwei Oberflächen dieselben Bezeichnungen brauchen: der
 * Consent-Bildschirm und die Liste der verbundenen Anwendungen. Die Schlüssel
 * müssen dabei Literale bleiben — `next-intl` prüft sie zur Übersetzungszeit.
 */
export const MCP_SCOPE_LABEL_KEYS = {
  'einsatz:read': 'scopeEinsatzRead',
  'einsatz:write': 'scopeEinsatzWrite',
  'hydranten:read': 'scopeHydrantenRead',
  berechnung: 'scopeBerechnung',
} as const;
