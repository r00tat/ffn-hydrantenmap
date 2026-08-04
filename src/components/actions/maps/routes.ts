import 'server-only';

import { GoogleAuth } from 'google-auth-library';
import type { GeoPositionObject } from '../../../common/geo';
import { getGcpProjectId } from '../../../server/firebase/project';

const ROUTES_URL = 'https://routes.googleapis.com/directions/v2:computeRoutes';

/**
 * Maps Platform authentifiziert wahlweise über API-Key oder OAuth. Wir nehmen
 * OAuth über den Service Account: Auf Cloud Run liefert ADC das Token ohne
 * jede Konfiguration, lokal greift `GOOGLE_APPLICATION_CREDENTIALS`. Damit
 * braucht es kein weiteres Secret im Deployment.
 *
 * Erzeugt erst beim ersten Aufruf: Ein `new GoogleAuth()` auf Modulebene
 * würde beim Import ausgeführt, bevor Tests ihre Mocks initialisiert haben
 * (statische Imports laufen vor restlichem Modulcode) — die Instanz wird
 * hier deshalb lazy angelegt und danach für Folgeaufrufe wiederverwendet,
 * damit Tokens weiterhin über Aufrufe hinweg gecacht werden.
 */
let auth: GoogleAuth | undefined;
function getAuth(): GoogleAuth {
  if (!auth) {
    auth = new GoogleAuth({
      scopes: ['https://www.googleapis.com/auth/maps-platform.routespreferred'],
    });
  }
  return auth;
}

interface ComputeRoutesResponse {
  routes?: { distanceMeters?: number }[];
}

function toLatLng(position: GeoPositionObject) {
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
 * Kilometern müssen weiterhin durchgehen.
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
      console.error('computeRouteDistanceMeters: no access token');
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
        origin: toLatLng(from),
        destination: toLatLng(to),
        travelMode: 'DRIVE',
        // Verkehrsabhängiges Routing fiele in eine teurere SKU und brächte für
        // eine im Nachhinein erfasste Fahrt ohnehin nichts.
        routingPreference: 'TRAFFIC_UNAWARE',
      }),
    });

    if (!response.ok) {
      console.error(
        `computeRouteDistanceMeters failed ${response.status}`,
        await response.text()
      );
      return undefined;
    }

    const body = (await response.json()) as ComputeRoutesResponse;
    return body.routes?.[0]?.distanceMeters;
  } catch (err) {
    console.error('computeRouteDistanceMeters failed', err);
    return undefined;
  }
}
