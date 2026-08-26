/**
 * Der RFC-8707-Resource-Identifier ist eine URL, die Clients uneinheitlich
 * schreiben: mal mit Trailing Slash, mal mit Fragment. Der Vergleich läuft
 * deshalb über eine normalisierte Form — und nur darüber, nie über einen
 * Präfix-Vergleich.
 */
export function normalizeResource(value: string): string {
  try {
    const url = new URL(value);
    // RFC 8707: das Fragment gehört nicht zum Bezeichner.
    url.hash = '';
    return url.toString().replace(/\/$/, '');
  } catch {
    return value.replace(/\/$/, '');
  }
}

/** Vergleicht einen `resource`-Parameter mit dem eigenen Resource-Identifier. */
export function matchesResource(
  candidate: string | null | undefined,
  resource: string,
): boolean {
  if (!candidate) {
    return false;
  }
  return normalizeResource(candidate) === normalizeResource(resource);
}
