/**
 * Ein einfacher Zähler pro Schlüssel und Zeitfenster.
 *
 * Bewusst im Prozessspeicher und nicht in Firestore: Der Zweck ist,
 * Missbrauch von `/api/oauth/register` und `/api/mcp` zu bremsen, nicht ihn
 * lückenlos zu unterbinden. Auf Cloud Run mit mehreren Instanzen gilt das
 * Limit je Instanz — die harte Schranke für Registrierungen zieht deshalb
 * zusätzlich `countRecentRegistrations` aus dem Store, das alle Instanzen
 * gemeinsam sehen.
 */

interface Window {
  count: number;
  resetAt: number;
}

const windows = new Map<string, Window>();
const MAX_TRACKED_KEYS = 10_000;

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  /** Sekunden bis zum Zurücksetzen — für `Retry-After`. */
  retryAfter: number;
}

export function checkRateLimit(
  key: string,
  limit: number,
  windowMs: number,
  now: number = Date.now(),
): RateLimitResult {
  const existing = windows.get(key);
  if (!existing || existing.resetAt <= now) {
    if (windows.size >= MAX_TRACKED_KEYS) {
      windows.clear();
    }
    windows.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, remaining: limit - 1, retryAfter: 0 };
  }

  existing.count += 1;
  const retryAfter = Math.ceil((existing.resetAt - now) / 1000);
  if (existing.count > limit) {
    return { allowed: false, remaining: 0, retryAfter };
  }
  return { allowed: true, remaining: limit - existing.count, retryAfter };
}

/** Nur für Tests. */
export function resetRateLimits(): void {
  windows.clear();
}

/**
 * Der Schlüssel, unter dem ein Aufrufer gezählt wird.
 *
 * Cloud Run setzt `X-Forwarded-For`; der erste Eintrag ist die Adresse des
 * Clients, alles danach stammt aus der Proxy-Kette und ist nicht
 * vertrauenswürdiger als der Client selbst.
 */
export function callerKey(headers: Headers, prefix: string): string {
  const forwarded = headers.get('x-forwarded-for');
  const ip = forwarded?.split(',')[0]?.trim() || 'unknown';
  return `${prefix}:${ip}`;
}
