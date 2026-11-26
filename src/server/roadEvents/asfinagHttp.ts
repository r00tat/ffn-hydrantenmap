import 'server-only';
import { request } from 'node:https';
import { gunzipSync } from 'node:zlib';

/**
 * Abruf eines Pakets aus dem ASFINAG-Content-Portal. Ist ein Client-Zertifikat
 * hinterlegt (PKCS#12, base64 in `ASFINAG_CLIENT_CERT`), geht der Abruf über
 * `node:https`, weil `fetch` kein Client-Zertifikat kennt. Siehe
 * docs/verkehrsmeldungen.md.
 */
const BASE_URL = 'https://content.asfinag.at/services/resource/';
const TIMEOUT_MS = 20_000;
/** Die Pakete sind wenige MB groß; mehr deutet auf einen Fehler hin. */
const MAX_BYTES = 50 * 1024 * 1024;

function resourceUrl(resourceKey: string): string {
  return BASE_URL + encodeURIComponent(resourceKey);
}

function withClientCertificate(
  url: string,
  pfx: Buffer,
  passphrase: string | undefined
): Promise<string> {
  return new Promise((resolve, reject) => {
    const req = request(
      url,
      {
        pfx,
        passphrase,
        headers: { Accept: 'application/xml', 'Accept-Encoding': 'gzip' },
        timeout: TIMEOUT_MS,
      },
      (res) => {
        if (res.statusCode !== 200) {
          res.resume();
          reject(new Error(`HTTP ${res.statusCode}`));
          return;
        }
        const chunks: Buffer[] = [];
        let size = 0;
        res.on('data', (chunk: Buffer) => {
          size += chunk.length;
          if (size > MAX_BYTES) {
            req.destroy(new Error('Antwort zu groß'));
            return;
          }
          chunks.push(chunk);
        });
        res.on('end', () => {
          const body = Buffer.concat(chunks);
          const gzipped = res.headers['content-encoding'] === 'gzip';
          resolve((gzipped ? gunzipSync(body) : body).toString('utf8'));
        });
        res.on('error', reject);
      }
    );
    req.on('timeout', () => req.destroy(new Error('Zeitüberschreitung')));
    req.on('error', reject);
    req.end();
  });
}

export async function fetchAsfinagXml(resourceKey: string): Promise<string> {
  const url = resourceUrl(resourceKey);
  const certificate = process.env.ASFINAG_CLIENT_CERT?.trim();
  if (certificate) {
    return withClientCertificate(
      url,
      Buffer.from(certificate, 'base64'),
      process.env.ASFINAG_CLIENT_CERT_PASSWORD
    );
  }
  const response = await fetch(url, {
    headers: { Accept: 'application/xml' },
    cache: 'no-store',
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.text();
}
