import 'server-only';
import { headers } from 'next/headers';

const LOCALHOST = 'http://localhost:3000';

function normalize(url: string): string {
  return url.trim().replace(/\/$/, '');
}

/**
 * Erlaubte Origins. Cloud Run reicht den Original-`Host` unverändert an den
 * Container durch, der Wert ist damit grundsätzlich vom Client beeinflussbar —
 * die Allowlist verhindert, dass eine fremde Origin in eine WebAuthn-Ceremony
 * oder in einen generierten Link gerät.
 *
 * Ohne `PASSKEY_ALLOWED_ORIGINS` gilt `NEXTAUTH_URL` plus localhost.
 */
function allowedOrigins(): string[] {
  const configured = process.env.PASSKEY_ALLOWED_ORIGINS;
  if (configured) {
    return configured.split(',').map(normalize).filter(Boolean);
  }
  return [
    ...(process.env.NEXTAUTH_URL ? [normalize(process.env.NEXTAUTH_URL)] : []),
    LOCALHOST,
  ];
}

/**
 * Die Origin des aktuellen Requests, geprüft gegen die Allowlist.
 *
 * Cloud Run stellt die öffentliche URL nicht als Umgebungsvariable bereit —
 * Custom Domains sind dem Container unbekannt. Der Request selbst ist die
 * einzige verlässliche Quelle: Cloud Run reicht den Original-`Host` durch und
 * setzt `X-Forwarded-Proto: https`. NextAuth v5 verfährt mit `trustHost: true`
 * genauso.
 *
 * Liefert `undefined`, wenn kein Request-Kontext existiert (Hintergrund-Job,
 * Build-Zeit) oder die Origin nicht auf der Allowlist steht.
 */
export async function requestOrigin(): Promise<string | undefined> {
  let host: string | null = null;
  let proto: string | null = null;
  try {
    const headerList = await headers();
    host = headerList.get('x-forwarded-host') ?? headerList.get('host');
    proto = headerList.get('x-forwarded-proto');
  } catch {
    // Außerhalb eines Requests wirft `headers()` — das ist kein Fehlerfall.
    return undefined;
  }
  if (!host) {
    return undefined;
  }

  // Eine Proxy-Kette kann mehrere Werte verketten ("https,http") — der erste
  // stammt vom äußersten Proxy und ist damit der maßgebliche.
  const forwarded = proto?.split(',')[0]?.trim();
  const scheme =
    forwarded ||
    (host.startsWith('localhost') || host.startsWith('127.0.0.1')
      ? 'http'
      : 'https');

  const origin = normalize(`${scheme}://${host}`);
  const allowed = allowedOrigins();
  if (allowed.includes(origin)) {
    return origin;
  }

  // In der lokalen Entwicklung zusätzlich jede localhost-Adresse akzeptieren,
  // unabhängig von Port und Schema: `next dev -p 3001`, `npm run dev:https` und
  // der Aufruf über 127.0.0.1 statt localhost sollen nicht an einer
  // Allowlist scheitern, die auf einen einzigen Port festgelegt ist. Nur
  // localhost — LAN-IPs und Tunnel-Domains sind über http ohnehin kein Secure
  // Context, dort verweigert schon der Browser die WebAuthn-Ceremony.
  if (process.env.NODE_ENV !== 'production' && isLoopbackOrigin(origin)) {
    return origin;
  }

  // Ohne diese Zeile ist ein Origin-Mismatch praktisch nicht zu diagnostizieren:
  // der Aufrufer sieht nur ein `undefined` bzw. eine generische Fehlermeldung.
  console.warn(
    `origin ${origin} is not allowed (allowed: ${allowed.join(', ') || 'none'})`,
  );
  return undefined;
}

/** localhost, 127.0.0.1 oder ::1 — unabhängig von Port und Schema. */
function isLoopbackOrigin(origin: string): boolean {
  try {
    const { hostname } = new URL(origin);
    return (
      hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]'
    );
  } catch {
    return false;
  }
}

/**
 * Die öffentliche Basis-URL für generierte Links. Bevorzugt die tatsächliche
 * Request-Origin, damit ein auf der Dev-Domain erzeugter Link auch auf die
 * Dev-Domain zeigt; `NEXTAUTH_URL` bleibt der Fallback für request-lose
 * Kontexte (E-Mail-Versand, Hintergrund-Jobs), wo es keine Alternative gibt.
 */
export async function getBaseUrl(): Promise<string> {
  return (
    (await requestOrigin()) ??
    (process.env.NEXTAUTH_URL ? normalize(process.env.NEXTAUTH_URL) : LOCALHOST)
  );
}

/** Die WebAuthn RP ID (Host ohne Schema und Port) zu einer Origin. */
export function rpIdFromOrigin(origin: string): string {
  return new URL(origin).hostname;
}
