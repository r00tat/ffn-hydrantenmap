import 'server-only';

import { GoogleAuth } from 'google-auth-library';
import type { GeoPositionObject } from '../../../common/geo';
import { getGcpProjectId } from '../../../server/firebase/project';

const ROUTES_URL = 'https://routes.googleapis.com/directions/v2:computeRoutes';

/**
 * Der Scope, den `v2:computeRoutes` verlangt.
 *
 * Nicht zu verwechseln mit `maps-platform.routespreferred`: Den nennt die
 * Referenz der **Routes Preferred API v1** (`routespreferred.googleapis.com`),
 * dem Vorgängerdienst. Auf `routes.googleapis.com/directions/v2` antwortet ein
 * damit gescoptes Token mit `403 ACCESS_TOKEN_SCOPE_INSUFFICIENT` — der
 * Scope existiert, deckt diese Methode aber nicht ab.
 */
const ROUTES_SCOPE = 'https://www.googleapis.com/auth/cloud-platform';

/**
 * Die Maps Platform akzeptiert wahlweise API-Key oder OAuth. Wir nehmen OAuth
 * über den Service Account, damit kein weiteres Secret ins Deployment muss.
 *
 * `cloud-platform` ist der Scope, den sowohl der Metadata-Server auf Cloud Run
 * als auch ein lokaler Service-Account-Key und ein Nutzer-ADC von sich aus
 * ausstellen. Damit braucht es keinen Umweg über die IAM Credentials API, und
 * das Token ist in allen drei Umgebungen dasselbe.
 *
 * Die Abrechnung hängt dabei nicht am Token, sondern am Header
 * `X-Goog-User-Project` (siehe unten) — dessen Projekt braucht
 * `roles/serviceusage.serviceUsageConsumer` (siehe `terraform/main.tf`).
 */
let auth: GoogleAuth | undefined;
function getAuth(): GoogleAuth {
  // Erst beim ersten Aufruf erzeugt: Vitest hebt die `vi.mock`-Factory über die
  // `const`-Deklarationen des Testmoduls, auf die sie zugreift — ein
  // `new GoogleAuth()` auf Modulebene liefe, während diese Bindungen noch in
  // ihrer temporalen Totzone liegen.
  if (!auth) {
    auth = new GoogleAuth({ scopes: [ROUTES_SCOPE] });
  }
  return auth;
}

async function getRoutesToken(): Promise<string | undefined> {
  // `GoogleAuth` hält den Client intern und cacht dessen Token bis kurz vor
  // Ablauf — pro Routing-Aufruf entsteht also kein zweiter Netzaufruf.
  const token = await getAuth().getAccessToken();
  return token ?? undefined;
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
      getRoutesToken(),
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
      // Zeitlimit schützt vor einer Verbindung, die ins Leere läuft, nicht vor
      // einer bloß langsamen Antwort der API.
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
    console.error('computeRouteDistanceMeters: Aufruf fehlgeschlagen', err, {
      from,
      to,
    });
    return undefined;
  }
}

export interface RouteLegsMeters {
  /** Hinweg in Metern. */
  outboundMeters: number;
  /** Rückweg in Metern. */
  returnMeters: number;
}

/**
 * Hin- und Rückweg getrennt gemessen — zwei Routenabfragen, nicht eine
 * verdoppelte.
 *
 * Der Rückweg ist nicht der gespiegelte Hinweg: Auf der Autobahn liegt die
 * nächste Abfahrt Kilometer hinter dem Einsatzort, Einbahnen und
 * Abbiegeverbote wirken ebenso nur in einer Richtung. Im Ortsgebiet fallen
 * beide Strecken meist zusammen, dort kostet die zweite Abfrage nur einen
 * Aufruf.
 *
 * `undefined`, sobald eine der beiden Richtungen fehlt: Ein halbes Ergebnis
 * ließe sich nur durch Verdoppeln der anderen Richtung retten — genau die
 * Annahme, die hier abgelöst wird. Der Aufrufer fällt dann auf die
 * Luftlinien-Schätzung zurück, die sich als Schätzung ausweist.
 */
export async function computeRouteLegsMeters(
  from: GeoPositionObject,
  to: GeoPositionObject
): Promise<RouteLegsMeters | undefined> {
  const [outboundMeters, returnMeters] = await Promise.all([
    computeRouteDistanceMeters(from, to),
    computeRouteDistanceMeters(to, from),
  ]);

  if (outboundMeters === undefined || returnMeters === undefined) {
    console.error('computeRouteLegsMeters: unvollständige Route', {
      outboundMeters,
      returnMeters,
      from,
      to,
    });
    return undefined;
  }
  return { outboundMeters, returnMeters };
}
