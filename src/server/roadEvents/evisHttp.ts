import 'server-only';
import { gunzipSync } from 'node:zlib';
import type { EvisClient, EvisPackage } from './roadEventsSource';

/**
 * Abruf der Verkehrsmeldungen von EVIS.AT (Data Supply, Lizenz CC BY 4.0
 * ASFINAG). Der persönliche Schlüssel steht in der Adresse und darf nicht
 * weitergegeben werden: Abgerufen wird nur am Server, und Fehlermeldungen
 * nennen nie die Adresse. Siehe docs/verkehrsmeldungen.md.
 */
const BASE_URL = 'https://datasupply-evis.asfinag.at/1.0';
/** DATEX II 2.3 der Ereignisse (die Verkehrsbeschränkungen wären 3.3). */
const DATEX_VERSION = '2.2.3';
const TIMEOUT_MS = 20_000;
/**
 * Ganz Österreich (`AT`) sind bei den geplanten Ereignissen gut 50 MB, davon
 * über 40 MB Autobahnen; ein Vielfaches davon deutet auf einen Fehler hin.
 */
const MAX_BYTES = 200 * 1024 * 1024;

export function evisUrl(
  kind: 'getdata' | 'getchecksum',
  pkg: EvisPackage,
  region: string,
  apiKey: string
): string {
  return `${BASE_URL}/${kind}/${pkg}/${encodeURIComponent(region)}/${DATEX_VERSION}?apiKey=${encodeURIComponent(apiKey)}`;
}

/**
 * EVIS liefert gzip als `application/gzip`, ohne `Content-Encoding` —
 * `fetch` entpackt das nicht von selbst. Erkannt wird es an den ersten
 * beiden Bytes.
 */
export function decodeBody(body: Buffer): string {
  const gzipped = body.length >= 2 && body[0] === 0x1f && body[1] === 0x8b;
  return (gzipped ? gunzipSync(body) : body).toString('utf8').replace(/^﻿/, '');
}

export function parseChecksum(json: string): string {
  // 204 ohne Inhalt: ein leeres Paket hat auch eine feste „Prüfsumme“.
  if (!json.trim()) return '';
  // EVIS liefert sie als Zahl (`"Checksum":1795772929366`); Text geht auch.
  const checksum = (JSON.parse(json) as { Checksum?: unknown }).Checksum;
  if (
    (typeof checksum !== 'string' && typeof checksum !== 'number') ||
    checksum === ''
  ) {
    throw new Error('EVIS: Antwort ohne Prüfsumme');
  }
  return String(checksum);
}

async function get(url: string, label: string): Promise<string> {
  const response = await fetch(url, {
    cache: 'no-store',
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  // 204: Für Paket und Region gibt es gerade nichts.
  if (response.status === 204) return '';
  if (!response.ok) {
    throw new Error(`EVIS ${label}: HTTP ${response.status}`);
  }
  const body = Buffer.from(await response.arrayBuffer());
  if (body.length > MAX_BYTES)
    throw new Error(`EVIS ${label}: Antwort zu groß`);
  return decodeBody(body);
}

export const evisClient: EvisClient = {
  fetchData: (pkg, region, apiKey) =>
    get(evisUrl('getdata', pkg, region, apiKey), `${pkg}/${region}`),
  fetchChecksum: async (pkg, region, apiKey) =>
    parseChecksum(
      await get(
        evisUrl('getchecksum', pkg, region, apiKey),
        `Prüfsumme ${pkg}/${region}`
      )
    ),
};
