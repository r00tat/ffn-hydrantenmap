/** Versuche je Datei, inklusive des ersten. */
const MAX_ATTEMPTS = 5;
const BASE_DELAY_MS = 1_000;

interface XhrResult {
  /** `0` bei einem Netz- oder CORS-Fehler. */
  status: number;
  responseText: string;
  range: string | null;
}

export interface UploadOptions {
  /** Für Tests ersetzbar. */
  sleep?: (ms: number) => Promise<void>;
}

const defaultSleep = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

function send(
  uploadUrl: string,
  headers: Record<string, string>,
  body?: Blob,
  onProgress?: (loaded: number) => void,
): Promise<XhrResult> {
  return new Promise((resolve) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', uploadUrl, true);
    for (const [name, value] of Object.entries(headers)) {
      xhr.setRequestHeader(name, value);
    }
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && onProgress) onProgress(event.loaded);
    };
    xhr.onload = () =>
      resolve({
        status: xhr.status,
        responseText: xhr.responseText ?? '',
        range: xhr.getResponseHeader('Range'),
      });
    xhr.onerror = () => resolve({ status: 0, responseText: '', range: null });
    xhr.send(body);
  });
}

const isDone = (status: number) => status >= 200 && status < 300;

function isRetryable({ status, responseText }: XhrResult): boolean {
  // 308: Die Session wartet noch auf Bytes — das ist ein offener Upload,
  // kein Fehler.
  if (status === 0 || status === 308 || status === 429 || status >= 500) {
    return true;
  }
  return status === 403 && /rateLimitExceeded/i.test(responseText);
}

function describeFailure({ status }: XhrResult): Error {
  return status === 0
    ? new Error('upload failed (network or CORS error)')
    : new Error(`upload failed with status ${status}`);
}

/** Nächstes fehlendes Byte aus `Range: bytes=0-N`; ohne Header ab 0. */
function nextOffset(range: string | null): number {
  const match = range?.match(/bytes=0-(\d+)/);
  return match ? Number(match[1]) + 1 : 0;
}

/**
 * Lädt die Datei auf eine resumable Upload-Session.
 *
 * `XMLHttpRequest` statt `fetch`, weil nur XHR einen Fortschritt beim
 * *Senden* meldet — `fetch` kann das bis heute nicht.
 *
 * Bricht der Upload ab oder drosselt Drive (429, 5xx, 403 mit
 * `rateLimitExceeded`), fragt die Funktion nach einer Wartezeit ab, wie viel
 * schon angekommen ist (leerer PUT mit `Content-Range: bytes *` und der
 * Größe), und schickt nur den Rest. So verlangt es die Drive-Doku für resumable Uploads; gerade beim
 * Hochladen vieler Fotos auf einmal kommt die Drosselung sonst als Fehlschlag
 * beim Benutzer an.
 */
export async function uploadToDriveSession(
  uploadUrl: string,
  file: File,
  onProgress?: (loaded: number, total: number) => void,
  { sleep = defaultSleep }: UploadOptions = {},
): Promise<void> {
  const total = file.size;
  const contentType = file.type || 'application/octet-stream';

  let result = await send(uploadUrl, { 'Content-Type': contentType }, file, (loaded) =>
    onProgress?.(loaded, total),
  );

  for (let attempt = 1; !isDone(result.status); attempt++) {
    if (attempt >= MAX_ATTEMPTS || !isRetryable(result)) {
      throw describeFailure(result);
    }
    await sleep(BASE_DELAY_MS * 2 ** (attempt - 1) + Math.random() * 500);

    const status = await send(uploadUrl, { 'Content-Range': `bytes */${total}` });
    if (isDone(status.status)) return;
    if (status.status !== 308) {
      // Session abgelaufen (404) oder erneut gedrosselt: mit dieser Antwort
      // in die nächste Runde.
      result = status;
      continue;
    }

    const start = nextOffset(status.range);
    if (start >= total) {
      result = status;
      continue;
    }
    result = await send(
      uploadUrl,
      {
        'Content-Type': contentType,
        'Content-Range': `bytes ${start}-${total - 1}/${total}`,
      },
      file.slice(start),
      (loaded) => onProgress?.(start + loaded, total),
    );
  }
}
