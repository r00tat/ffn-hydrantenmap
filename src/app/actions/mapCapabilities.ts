'use server';
import 'server-only';

import { isPublicHttpsUrl } from '../../common/fetchTargetGuard';
import {
  capabilitiesUrl,
  parseWmsCapabilities,
  serviceUrlForLayer,
  type WmsCapabilitiesLayer,
} from '../../common/wmsCapabilities';
import { actionUserRequired } from '../auth';

/**
 * Ein `GetCapabilities` muss über den Server laufen: die Geodatendienste setzen
 * keine CORS-Kopfzeilen, der Browser käme also nicht an die Antwort.
 *
 * Damit fragt aber die Cloud-Run-Instanz eine vom Benutzer eingegebene Adresse
 * an, und ihr Netz ist ein anderes als das des Browsers. Deshalb hier drei
 * Schranken: `isPublicHttpsUrl` vor dem Abruf, dieselbe Prüfung noch einmal
 * bei jedem Umzug (`redirect: 'manual'`), und eine Größengrenze, die beim
 * Lesen greift und nicht erst danach.
 */

/** Grenze für die Antwort. Capabilities großer Dienste liegen bei wenigen MB. */
const MAX_CAPABILITIES_BYTES = 8 * 1024 * 1024;
const REQUEST_TIMEOUT_MS = 20_000;
/** Umzüge sind bei Geodatendiensten üblich (http→https, alte Pfade). */
const MAX_REDIRECTS = 3;

export interface WmsCapabilitiesResult {
  /**
   * Die Adresse für die Kachelanfragen: die vom Dienst genannte GetMap-Adresse,
   * ersatzweise die eingegebene ohne ihre Anfrageparameter.
   */
  serviceUrl: string;
  title?: string;
  version?: string;
  formats: string[];
  layers: WmsCapabilitiesLayer[];
  error?: 'invalid-url' | 'unreachable' | 'no-layers';
}

function failure(
  error: NonNullable<WmsCapabilitiesResult['error']>
): WmsCapabilitiesResult {
  return { serviceUrl: '', formats: [], layers: [], error };
}

/**
 * Den Körper lesen und dabei zählen.
 *
 * `response.text()` würde erst die ganze Antwort in den Speicher holen und
 * danach die Grenze prüfen — eine Grenze, die nichts begrenzt. Ein Dienst, der
 * endlos sendet, könnte damit den Server zum Erliegen bringen. Deshalb
 * stückweise lesen und beim Überschreiten abbrechen.
 */
async function readCapped(
  response: Response,
  maxBytes: number
): Promise<string | undefined> {
  const declared = Number(response.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > maxBytes) return undefined;

  const body = response.body;
  if (!body) return undefined;

  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) {
        await reader.cancel();
        return undefined;
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const merged = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(merged);
}

/**
 * Ein `GetCapabilities` abrufen und dabei jedem Umzug einzeln zusehen.
 *
 * `redirect: 'follow'` würde die Prüfung der Adresse aushebeln: der erste
 * Aufruf ginge an einen harmlosen öffentlichen Namen, dessen Antwort dann auf
 * `http://169.254.169.254/` verweist — und `fetch` folgte ungefragt. Also
 * `manual` und jede Station erneut durch `isPublicHttpsUrl`.
 */
async function fetchCapabilities(url: string): Promise<string | undefined> {
  let target = url;

  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    if (!isPublicHttpsUrl(target)) return undefined;

    const response = await fetch(target, {
      // Ein Dienst, der ewig braucht, darf die Server Action nicht blockieren.
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      redirect: 'manual',
      headers: { accept: 'text/xml, application/xml, */*' },
    });

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location');
      await response.body?.cancel();
      if (!location) return undefined;
      target = new URL(location, target).toString();
      continue;
    }

    if (!response.ok) {
      await response.body?.cancel();
      return undefined;
    }
    return readCapped(response, MAX_CAPABILITIES_BYTES);
  }

  return undefined;
}

/**
 * Die anforderbaren Layer eines WMS.
 *
 * Versucht 1.3.0 und fällt auf 1.1.1 zurück — ältere ArcGIS- und
 * MapServer-Installationen beantworten nur eine der beiden Fassungen brauchbar.
 */
export async function loadWmsCapabilities(
  serviceUrl: string
): Promise<WmsCapabilitiesResult> {
  await actionUserRequired();

  if (!isPublicHttpsUrl(serviceUrl)) return failure('invalid-url');

  let answered = false;
  for (const version of ['1.3.0', '1.1.1']) {
    let body: string | undefined;
    try {
      body = await fetchCapabilities(capabilitiesUrl(serviceUrl, version));
    } catch (err) {
      console.warn(
        `GetCapabilities ${version} für ${serviceUrl} scheiterte`,
        err
      );
      continue;
    }
    if (!body) continue;
    answered = true;

    const capabilities = parseWmsCapabilities(body);
    if (capabilities.layers.length > 0) {
      return {
        ...capabilities,
        serviceUrl: serviceUrlForLayer(serviceUrl, capabilities.getMapUrl),
      };
    }
  }

  // Geantwortet, aber nichts Anforderbares darin: die Adresse zeigt auf etwas
  // anderes als einen WMS. Gar keine Antwort: der Dienst ist nicht erreichbar.
  return failure(answered ? 'no-layers' : 'unreachable');
}
