'use server';
import 'server-only';

import { isSafeMapLayerUrl } from '../../common/mapLayers';
import {
  capabilitiesUrl,
  parseWmsCapabilities,
  stripWmsRequestParams,
  type WmsCapabilitiesLayer,
} from '../../common/wmsCapabilities';
import { actionUserRequired } from '../auth';

/**
 * Ein `GetCapabilities` muss über den Server laufen: die Geodatendienste setzen
 * keine CORS-Kopfzeilen, der Browser käme also nicht an die Antwort. Der Umweg
 * ist zugleich die Stelle, an der die eingegebene URL geprüft wird, bevor
 * überhaupt jemand sie anfragt.
 */

/** Grenze für die Antwort. Capabilities großer Dienste liegen bei wenigen MB. */
const MAX_CAPABILITIES_BYTES = 8 * 1024 * 1024;
const REQUEST_TIMEOUT_MS = 20_000;

export interface WmsCapabilitiesResult {
  /** Die um Anfrageparameter bereinigte Dienst-URL für die Kartenebene. */
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

async function fetchCapabilities(url: string): Promise<string | undefined> {
  const response = await fetch(url, {
    // Ein Dienst, der ewig braucht, darf die Server Action nicht blockieren.
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    redirect: 'follow',
    headers: { accept: 'text/xml, application/xml, */*' },
  });
  if (!response.ok) return undefined;

  const body = await response.text();
  if (body.length > MAX_CAPABILITIES_BYTES) return undefined;
  return body;
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

  if (!isSafeMapLayerUrl(serviceUrl)) return failure('invalid-url');

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
        serviceUrl: stripWmsRequestParams(serviceUrl),
        ...capabilities,
      };
    }
  }

  // Geantwortet, aber nichts Anforderbares darin: die Adresse zeigt auf etwas
  // anderes als einen WMS. Gar keine Antwort: der Dienst ist nicht erreichbar.
  return failure(answered ? 'no-layers' : 'unreachable');
}
