import { isIP } from 'net';

/**
 * SSRF-Schutz für den CIMD-Abruf.
 *
 * Der Authorization Server holt bei Client ID Metadata Documents eine URL ab,
 * die der Angreifer vollständig bestimmt. Ohne diese Prüfung wäre das ein
 * Werkzeug, um aus dem Cloud-Run-Container heraus interne Adressen abzufragen —
 * allen voran den Metadaten-Server unter `169.254.169.254`, der Tokens des
 * Dienst-Kontos ausgibt.
 *
 * Geprüft wird der aufgelöste Adressbereich, nicht der Name: `evil.example`
 * darf auf `127.0.0.1` zeigen, und genau das ist der übliche Bypass.
 */

/** IPv4-Bereiche, die nie Ziel eines Abrufs sein dürfen (CIDR als [ip, bits]). */
const BLOCKED_V4: Array<[string, number]> = [
  ['0.0.0.0', 8], // "this network"
  ['10.0.0.0', 8], // privat
  ['100.64.0.0', 10], // CGNAT
  ['127.0.0.0', 8], // Loopback
  ['169.254.0.0', 16], // Link-local, enthält den Metadaten-Server
  ['172.16.0.0', 12], // privat
  ['192.0.0.0', 24], // IETF-Protokollzuweisungen
  ['192.0.2.0', 24], // TEST-NET-1
  ['192.88.99.0', 24], // 6to4-Relay
  ['192.168.0.0', 16], // privat
  ['198.18.0.0', 15], // Benchmark
  ['198.51.100.0', 24], // TEST-NET-2
  ['203.0.113.0', 24], // TEST-NET-3
  ['224.0.0.0', 4], // Multicast
  ['240.0.0.0', 4], // reserviert, enthält 255.255.255.255
];

function ipv4ToInt(ip: string): number | undefined {
  const parts = ip.split('.');
  if (parts.length !== 4) {
    return undefined;
  }
  let value = 0;
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) {
      return undefined;
    }
    const octet = Number(part);
    if (octet > 255) {
      return undefined;
    }
    value = value * 256 + octet;
  }
  return value;
}

function isBlockedV4(ip: string): boolean {
  const value = ipv4ToInt(ip);
  if (value === undefined) {
    return true;
  }
  return BLOCKED_V4.some(([network, bits]) => {
    const base = ipv4ToInt(network);
    if (base === undefined) {
      return false;
    }
    // `>>> 0`, weil ein Shift in JavaScript auf 32 Bit mit Vorzeichen rechnet
    // und /0-artige Masken sonst negativ werden.
    const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
    return (value & mask) >>> 0 === (base & mask) >>> 0;
  });
}

function isBlockedV6(ip: string): boolean {
  const normalized = ip.toLowerCase().replace(/^\[|\]$/g, '');
  if (normalized === '::' || normalized === '::1') {
    return true;
  }
  // IPv4-mapped (`::ffff:127.0.0.1`) über die IPv4-Regeln prüfen — sonst
  // führt der Umweg über IPv6 direkt am Filter vorbei.
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(normalized);
  if (mapped) {
    return isBlockedV4(mapped[1]);
  }
  return (
    normalized.startsWith('fc') || // Unique Local fc00::/7
    normalized.startsWith('fd') ||
    normalized.startsWith('fe8') || // Link-local fe80::/10
    normalized.startsWith('fe9') ||
    normalized.startsWith('fea') ||
    normalized.startsWith('feb') ||
    normalized.startsWith('ff') // Multicast
  );
}

/** Ist diese IP-Adresse für einen ausgehenden Abruf gesperrt? */
export function isBlockedAddress(address: string): boolean {
  const version = isIP(address);
  if (version === 4) {
    return isBlockedV4(address);
  }
  if (version === 6) {
    return isBlockedV6(address);
  }
  // Kein gültiges Literal — der Aufrufer hat hier bereits aufgelöst, ein
  // unbekanntes Format ist dann ein Fehler und kein öffentliches Ziel.
  return true;
}

/**
 * Namen, die ohne DNS-Auflösung feststehen. `localhost` wird von Node über
 * `/etc/hosts` aufgelöst und käme sonst je nach Umgebung durch.
 */
export function isBlockedHostname(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/\.$/, '');
  if (host === 'localhost' || host.endsWith('.localhost')) {
    return true;
  }
  if (host === 'metadata' || host === 'metadata.google.internal') {
    return true;
  }
  if (host.endsWith('.internal') || host.endsWith('.local')) {
    return true;
  }
  if (isIP(host) || isIP(host.replace(/^\[|\]$/g, ''))) {
    return isBlockedAddress(host.replace(/^\[|\]$/g, ''));
  }
  return false;
}
