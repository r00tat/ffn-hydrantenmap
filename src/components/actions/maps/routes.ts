import 'server-only';

import { GoogleAuth } from 'google-auth-library';
import type { GeoPositionObject } from '../../../common/geo';
import { getGcpProjectId } from '../../../server/firebase/project';

const ROUTES_URL = 'https://routes.googleapis.com/directions/v2:computeRoutes';

// Der Scope stammt aus der Vorgängerversion der API und ist gegen den
// aktuellen v2:computeRoutes-Endpunkt nicht verifiziert. Auf Cloud Run
// ignoriert der Metadata-Server angeforderte Scopes und liefert ohnehin das
// Standardtoken — ein falscher Scope fällt dort erst als 403 im
// Nicht-OK-Zweig auf. Lokal mit Service-Account-JSON lehnt dagegen schon die
// Tokenausgabe mit `invalid_scope` ab.
const ROUTES_SCOPE =
  'https://www.googleapis.com/auth/maps-platform.routespreferred';

/**
 * Die Maps Platform akzeptiert wahlweise API-Key oder OAuth. Wir nehmen OAuth
 * über den Service Account: Auf Cloud Run liefert ADC das Token ohne jede
 * Konfiguration, lokal greift `GOOGLE_APPLICATION_CREDENTIALS`. Damit braucht
 * es kein weiteres Secret im Deployment.
 *
 * Die Instanz wird erst beim ersten Aufruf erzeugt: Vitest hebt die
 * `vi.mock`-Factory über die `const`-Deklaration, die sie einschließt — ein
 * `new GoogleAuth()` auf Modulebene träfe diese Bindung deshalb in ihrer
 * temporalen Totzone. Danach bleibt die Instanz für Folgeaufrufe erhalten,
 * damit Tokens über Aufrufe hinweg gecacht werden.
 */
let auth: GoogleAuth | undefined;
function getAuth(): GoogleAuth {
  if (!auth) {
    auth = new GoogleAuth({ scopes: [ROUTES_SCOPE] });
  }
  return auth;
}

interface ComputeRoutesResponse {
  // proto3 lässt Felder mit Standardwert in der JSON-Ausgabe weg — eine Route
  // über 0 m sieht dadurch genauso aus wie eine unerwartete Antwort.
  routes?: { distanceMeters?: number }[];
}

function toWaypoint(position: GeoPositionObject) {
  return {
    location: { latLng: { latitude: position.lat, longitude: position.lng } },
  };
}

/**
 * Die einfache Straßenstrecke in Metern, oder `undefined`, wenn der Dienst
 * nicht antwortet.
 *
 * Wirft bewusst nicht: Ein Ausfall des Routings darf das Speichern der
 * Fahrtenbuch-Einträge nicht abbrechen — Zeilen mit von Hand eingetragenen
 * Kilometern müssen weiterhin gespeichert werden können.
 */
export async function computeRouteDistanceMeters(
  from: GeoPositionObject,
  to: GeoPositionObject
): Promise<number | undefined> {
  try {
    const [token, project] = await Promise.all([
      getAuth().getAccessToken(),
      getGcpProjectId(),
    ]);
    if (!token) {
      console.error('computeRouteDistanceMeters: kein Access-Token', {
        from,
        to,
      });
      return undefined;
    }

    const response = await fetch(ROUTES_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        // Ohne FieldMask lehnt die Routes API den Aufruf ab.
        'X-Goog-FieldMask': 'routes.distanceMeters',
        // Ordnet Kontingent und Abrechnung dem eigenen Projekt zu; bei OAuth
        // ist das Projekt sonst nicht aus dem Aufruf ableitbar.
        'X-Goog-User-Project': project,
      },
      body: JSON.stringify({
        origin: toWaypoint(from),
        destination: toWaypoint(to),
        travelMode: 'DRIVE',
        // Verkehrsabhängiges Routing fiele in eine teurere SKU und brächte für
        // eine im Nachhinein erfasste Fahrt ohnehin nichts.
        routingPreference: 'TRAFFIC_UNAWARE',
      }),
      // Der Aufrufer hält währenddessen einen offenen Firestore-Batch — das
      // Zeitlimit schützt vor einer blackholed Verbindung, nicht vor der
      // Rundreisezeit der API.
      signal: AbortSignal.timeout(8000),
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => '<kein Body>');
      console.error(
        `computeRouteDistanceMeters: Fehler ${response.status}`,
        detail,
        { from, to }
      );
      return undefined;
    }

    const body = (await response.json()) as ComputeRoutesResponse;
    const distanceMeters = body.routes?.[0]?.distanceMeters;
    if (distanceMeters === undefined) {
      console.error(
        'computeRouteDistanceMeters: keine Route oder unerwartete Antwort',
        body,
        { from, to }
      );
    }
    return distanceMeters;
  } catch (err) {
    console.error('computeRouteDistanceMeters failed', err, { from, to });
    return undefined;
  }
}
