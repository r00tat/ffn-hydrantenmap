/**
 * Prüft ein `callbackUrl`, bevor daraus eine Navigation wird.
 *
 * Zugelassen sind ausschließlich anwendungsinterne Pfade: Ein absoluter Link
 * — auch `//evil.example`, das der Browser als Protokoll-relative URL liest —
 * machte die Anmeldeseite zu einer offenen Weiterleitung.
 */
export function safeCallbackUrl(
  value: string | null | undefined,
  fallback: string,
): string {
  if (!value) {
    return fallback;
  }
  if (!value.startsWith('/') || value.startsWith('//')) {
    return fallback;
  }
  // `/\` wird von einigen Browsern wie `//` behandelt.
  if (value.startsWith('/\\')) {
    return fallback;
  }
  return value;
}
