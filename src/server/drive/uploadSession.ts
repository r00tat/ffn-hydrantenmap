import 'server-only';

const RESUMABLE_URL =
  'https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&supportsAllDrives=true';

/** Versuche je Session, inklusive des ersten. */
const MAX_ATTEMPTS = 5;
const BASE_DELAY_MS = 500;

/**
 * Gleichzeitig eröffnete Sessions. Drive drosselt Schreibzugriffe je Konto
 * (grob ab drei je Sekunde) mit 403 `userRateLimitExceeded` oder 429 — und
 * jede Session legt eine Datei an. Mit allen Dateien auf einmal scheiterte
 * ab etwa zehn Fotos der ganze Stapel.
 */
export const SESSION_CONCURRENCY = 2;

export interface ResumableFile {
  name: string;
  mimeType: string;
  size: number;
}

const RATE_LIMIT_REASONS = /rateLimitExceeded|userRateLimitExceeded|backendError/;

function isRetryable(status: number, body: string): boolean {
  if (status === 429 || status >= 500) return true;
  return status === 403 && RATE_LIMIT_REASONS.test(body);
}

const defaultSleep = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Eröffnet eine resumable Upload-Session für eine Datei im Ordner `folderId`
 * und liefert ihre Upload-URL. Gedrosselte und vorübergehende Fehler werden
 * mit exponentiellem Backoff wiederholt, wie es die Drive-Doku verlangt.
 */
export async function openResumableSession({
  token,
  origin,
  folderId,
  file,
  fetchFn = fetch,
  sleep = defaultSleep,
}: {
  token: string;
  origin: string | undefined;
  folderId: string;
  file: ResumableFile;
  fetchFn?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
}): Promise<string> {
  for (let attempt = 1; ; attempt++) {
    const res = await fetchFn(RESUMABLE_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json; charset=UTF-8',
        'X-Upload-Content-Type': file.mimeType || 'application/octet-stream',
        'X-Upload-Content-Length': String(file.size),
        // Der Origin-Header beim Eröffnen ist das, woran die Session ihre
        // CORS-Erlaubnis knüpft — ohne ihn kann der Browser die Bytes nicht
        // liefern.
        ...(origin ? { Origin: origin } : {}),
      },
      body: JSON.stringify({ name: file.name, parents: [folderId] }),
    });
    const uploadUrl = res.headers.get('location');
    if (res.ok && uploadUrl) return uploadUrl;

    const body = res.ok ? '' : await res.text().catch(() => '');
    if (attempt >= MAX_ATTEMPTS || !isRetryable(res.status, body)) {
      throw new Error(`could not start upload for ${file.name}: ${res.status}`);
    }
    const delay = BASE_DELAY_MS * 2 ** (attempt - 1) + Math.random() * 250;
    console.warn(
      `drive session for ${file.name} got ${res.status}, retrying in ${Math.round(delay)} ms`,
    );
    await sleep(delay);
  }
}
