/**
 * Welche Adressen der Server im Auftrag eines Benutzers abrufen darf.
 *
 * Das `GetCapabilities` einer eigenen Kartenebene ist die einzige Stelle, an
 * der die Anwendung eine **vom Benutzer eingegebene** Adresse selbst anfragt.
 * Damit steht sie im Netz der Cloud-Run-Instanz und nicht im Browser: was von
 * dort erreichbar ist — interne Dienste, das Metadaten-Endpoint der
 * Plattform, Adressen im VPC — wäre über diesen Umweg anfragbar (SSRF).
 *
 * Dieses Modul beantwortet deshalb eine einzige Frage: Zeigt die Adresse nach
 * außen? Es ist bewusst streng — ein WMS eines Landes oder Bezirks steht immer
 * unter einem öffentlichen Namen.
 *
 * **Was es nicht leistet:** Es prüft den *Namen*, nicht die aufgelöste
 * Adresse. Ein öffentlicher Name, der auf `127.0.0.1` zeigt (DNS-Rebinding),
 * käme durch. Das abzufangen hieße, selbst aufzulösen und die Verbindung an die
 * geprüfte IP zu binden — mit `fetch` nicht möglich. Die verbleibende Lücke ist
 * ein blinder Abruf durch einen bereits angemeldeten Benutzer; die Antwort
 * verlässt den Server nur als Liste von WMS-Layern.
 */

/** Namen, die nie nach außen zeigen. */
const BLOCKED_HOSTNAMES = new Set(['localhost', 'metadata.google.internal']);

/** Endungen, die für interne Namensräume reserviert sind. */
const BLOCKED_SUFFIXES = ['.localhost', '.local', '.internal', '.home.arpa'];

/** Ein IPv4-Literal als vier Zahlen, sonst `undefined`. */
function parseIpv4(hostname: string): number[] | undefined {
  const parts = hostname.split('.');
  if (parts.length !== 4) return undefined;
  const octets = parts.map((part) =>
    /^\d{1,3}$/.test(part) ? Number(part) : Number.NaN
  );
  if (octets.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) {
    return undefined;
  }
  return octets;
}

/**
 * Adressbereiche, die nicht im öffentlichen Internet geroutet werden.
 *
 * Neben den offensichtlichen (`127/8`, `10/8`, `192.168/16`) stehen hier auch
 * `169.254/16` — dort liegt das Metadaten-Endpoint der Cloud —, das
 * Carrier-Grade-NAT `100.64/10` und die Benchmark-Bereiche.
 */
function isPrivateIpv4(octets: number[]): boolean {
  const [a, b] = octets;
  if (a === 0 || a === 10 || a === 127) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 192 && b === 0) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;
  if (a === 198 && (b === 18 || b === 19)) return true;
  if (a >= 224) return true; // Multicast und reserviert
  return false;
}

/**
 * Zeigt die Adresse nach außen?
 *
 * Verlangt `https:` — ein Kartendienst über `http:` scheitert im Browser
 * ohnehin an Mixed Content, und `http:` wäre der bequemste Weg zu einem
 * internen Dienst.
 */
export function isPublicHttpsUrl(value: string): boolean {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  if (url.protocol !== 'https:') return false;
  if (url.username !== '' || url.password !== '') return false;

  const hostname = url.hostname.toLowerCase().replace(/\.$/, '');
  if (!hostname) return false;
  if (BLOCKED_HOSTNAMES.has(hostname)) return false;
  if (BLOCKED_SUFFIXES.some((suffix) => hostname.endsWith(suffix))) {
    return false;
  }

  // IPv6-Literale kommen in eckigen Klammern. Ein Kartendienst wird nie so
  // adressiert, und die Sonderbereiche (`::1`, `fc00::/7`, `fe80::/10`, dazu
  // die IPv4-Abbildungen) einzeln zu prüfen wäre mehr Fläche für Fehler als
  // ein rundes Nein.
  if (hostname.startsWith('[') || hostname.includes(':')) return false;

  const ipv4 = parseIpv4(hostname);
  if (ipv4) return !isPrivateIpv4(ipv4);

  // Ein einteiliger Name (`intranet`, `gis`) wird über die Suchdomäne des
  // Netzes aufgelöst und zeigt damit nach innen.
  return hostname.includes('.');
}
