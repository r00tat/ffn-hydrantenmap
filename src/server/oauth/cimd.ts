import { lookup } from 'dns/promises';
import type { OAuthClient } from './types';
import {
  ClientMetadataError,
  normalizeClientMetadata,
} from './clientMetadata';
import { isBlockedAddress, isBlockedHostname } from './ssrf';

/**
 * Client ID Metadata Documents (CIMD).
 *
 * Seit der Spec-Revision 2026-07-28 ist Dynamic Client Registration formal
 * deprecated; Nachfolger ist CIMD: Die `client_id` **ist** die HTTPS-URL eines
 * Metadaten-Dokuments, das der Client selbst hostet und das der Authorization
 * Server abruft. Beides wird unterstützt — DCR, weil claude.ai es heute nutzt,
 * CIMD, weil es bleibt.
 *
 * Der Abruf ist der gefährlichste Teil des ganzen Servers: Die URL bestimmt
 * der Aufrufer. Deshalb HTTPS-Pflicht, kein Folgen von Weiterleitungen,
 * Timeout, Größenlimit, SSRF-Filter auf der aufgelösten Adresse — und die
 * Forderung, dass `client_id` im Dokument exakt der Abruf-URL entspricht.
 */

const CIMD_TIMEOUT_MS = 5_000;
const CIMD_MAX_BYTES = 64 * 1024;
const CIMD_CACHE_TTL_MS = 15 * 60 * 1000;
const CIMD_CACHE_MAX_ENTRIES = 200;

export interface CimdDependencies {
  fetchImpl?: typeof fetch;
  /** Auflösung des Hostnamens; ausgetauscht in Tests. */
  resolveHost?: (hostname: string) => Promise<string[]>;
  now?: () => number;
}

export class CimdError extends Error {}

interface CacheEntry {
  client: OAuthClient;
  expiresAt: number;
}

const cache = new Map<string, CacheEntry>();

/** Nur für Tests. */
export function resetCimdCache(): void {
  cache.clear();
}

/** Ist diese `client_id` eine CIMD-URL (und kein DCR-Bezeichner)? */
export function isCimdClientId(clientId: string): boolean {
  return /^https:\/\//i.test(clientId);
}

async function defaultResolveHost(hostname: string): Promise<string[]> {
  const results = await lookup(hostname, { all: true, verbatim: true });
  return results.map((entry) => entry.address);
}

/**
 * Prüft die URL, bevor irgendein Byte über die Leitung geht.
 *
 * Getrennt von `fetchClientIdMetadata`, damit die Regeln ohne Netzwerk
 * testbar sind.
 */
export function assertUsableCimdUrl(clientId: string): URL {
  let url: URL;
  try {
    url = new URL(clientId);
  } catch {
    throw new CimdError('client_id is not a valid URL');
  }
  if (url.protocol !== 'https:') {
    throw new CimdError('a CIMD client_id must use https');
  }
  if (url.username || url.password) {
    throw new CimdError('a CIMD client_id must not contain credentials');
  }
  if (url.hash) {
    throw new CimdError('a CIMD client_id must not contain a fragment');
  }
  if (url.port && url.port !== '443') {
    throw new CimdError('a CIMD client_id must use the default https port');
  }
  if (isBlockedHostname(url.hostname)) {
    throw new CimdError(`host ${url.hostname} is not an allowed CIMD host`);
  }
  return url;
}

/**
 * Holt und prüft ein Client ID Metadata Document.
 *
 * Das Ergebnis wird zwischengespeichert (15 min) — ohne Cache wäre jeder
 * `authorize`- und `token`-Aufruf ein ausgehender Request.
 */
export async function fetchClientIdMetadata(
  clientId: string,
  issuer: string,
  deps: CimdDependencies = {},
): Promise<OAuthClient> {
  const now = deps.now ?? Date.now;
  const cached = cache.get(clientId);
  if (cached && cached.expiresAt > now()) {
    return cached.client;
  }

  const url = assertUsableCimdUrl(clientId);
  const resolveHost = deps.resolveHost ?? defaultResolveHost;

  let addresses: string[];
  try {
    addresses = await resolveHost(url.hostname);
  } catch {
    throw new CimdError(`could not resolve ${url.hostname}`);
  }
  if (addresses.length === 0) {
    throw new CimdError(`could not resolve ${url.hostname}`);
  }
  // ALLE aufgelösten Adressen müssen öffentlich sein. Es reicht nicht, die
  // erste zu prüfen: Ein Angreifer kann mehrere A-Records setzen und darauf
  // spekulieren, dass der Verbindungsaufbau eine andere wählt.
  const blocked = addresses.find((address) => isBlockedAddress(address));
  if (blocked) {
    throw new CimdError(
      `${url.hostname} resolves to a blocked address (${blocked})`,
    );
  }

  const fetchImpl = deps.fetchImpl ?? fetch;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), CIMD_TIMEOUT_MS);
  let response: Response;
  try {
    response = await fetchImpl(url.toString(), {
      // Keine Weiterleitungen: Eine 302 auf eine interne Adresse führte am
      // gesamten SSRF-Filter vorbei, weil der nur die ursprüngliche URL sieht.
      redirect: 'error',
      signal: controller.signal,
      headers: { accept: 'application/json' },
      cache: 'no-store',
    });
  } catch (err) {
    throw new CimdError(
      `could not fetch client id metadata: ${(err as Error).message}`,
    );
  } finally {
    clearTimeout(timer);
  }

  if (!response.ok) {
    throw new CimdError(
      `client id metadata document responded with ${response.status}`,
    );
  }

  const declaredLength = Number(response.headers.get('content-length') || '0');
  if (declaredLength > CIMD_MAX_BYTES) {
    throw new CimdError('client id metadata document is too large');
  }

  const body = await response.text();
  if (body.length > CIMD_MAX_BYTES) {
    throw new CimdError('client id metadata document is too large');
  }

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(body);
  } catch {
    throw new CimdError('client id metadata document is not valid JSON');
  }

  // Der Kern der Bindung: Wer sich als `https://a.example/client` ausgibt,
  // muss unter genau dieser URL ein Dokument liegen haben, das sich selbst so
  // benennt. Sonst könnte jeder ein fremdes Dokument als seine `client_id`
  // ausgeben.
  if (parsed.client_id !== clientId) {
    throw new CimdError(
      'client_id in the metadata document does not match its URL',
    );
  }

  let metadata;
  try {
    metadata = normalizeClientMetadata(parsed);
  } catch (err) {
    if (err instanceof ClientMetadataError) {
      throw new CimdError(`invalid client id metadata: ${err.message}`);
    }
    throw err;
  }

  // Ein CIMD-Client ist immer ein Public Client: Er hat kein Geheimnis, das
  // der Authorization Server je gesehen hätte.
  if (metadata.token_endpoint_auth_method !== 'none') {
    throw new CimdError('a CIMD client must be a public client');
  }

  const client: OAuthClient = {
    ...metadata,
    client_id: clientId,
    client_id_issued_at: Math.floor(now() / 1000),
    source: 'cimd',
    issuer,
  };

  if (cache.size >= CIMD_CACHE_MAX_ENTRIES) {
    // Kein LRU nötig: Der Cache ist eine Abkürzung, kein Speicher. Bei
    // Überlauf wird der älteste Eintrag verworfen.
    const oldest = cache.keys().next();
    if (!oldest.done) {
      cache.delete(oldest.value);
    }
  }
  cache.set(clientId, { client, expiresAt: now() + CIMD_CACHE_TTL_MS });
  return client;
}
