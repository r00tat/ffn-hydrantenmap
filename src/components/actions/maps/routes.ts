import 'server-only';

import { GoogleAuth } from 'google-auth-library';
import type { GeoPositionObject, LatLngPosition } from '../../../common/geo';
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
 * Ein Aufruf von `v2:computeRoutes`, oder `undefined`, wenn er nicht zustande
 * kommt. Der Rumpf wird nicht ausgewertet — das macht der Aufrufer, der auch
 * die FieldMask bestimmt.
 *
 * `from`/`to` gehen nur in die Fehlermeldung ein: Ohne sie steht im Log ein
 * Statuscode ohne die Frage, zu der er die Antwort ist.
 */
async function callComputeRoutes(
  body: Record<string, unknown>,
  fieldMask: string,
  from: GeoPositionObject,
  to: GeoPositionObject
): Promise<unknown> {
  try {
    const [token, project] = await Promise.all([
      getRoutesToken(),
      getGcpProjectId(),
    ]);
    if (!token) {
      console.error('callComputeRoutes: kein Access-Token', { from, to });
      return undefined;
    }

    const response = await fetch(ROUTES_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        // Ohne FieldMask lehnt die Routes API den Aufruf ab.
        'X-Goog-FieldMask': fieldMask,
        // Ordnet Kontingent und Abrechnung dem eigenen Projekt zu; bei OAuth
        // ist das Projekt sonst nicht aus dem Aufruf ableitbar.
        'X-Goog-User-Project': project,
      },
      body: JSON.stringify(body),
      // Beide Aufrufer warten auf die Antwort, während eine Änderung schon
      // gespeichert ist — der Fahrtenbuch-Eintrag mit offenem Firestore-Batch,
      // die Leitung mit ihren neuen Punkten. Das Zeitlimit schützt vor einer
      // Verbindung, die ins Leere läuft, nicht vor einer bloß langsamen Antwort.
      signal: AbortSignal.timeout(8000),
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => '<kein Body>');
      console.error(`callComputeRoutes: Fehler ${response.status}`, detail, {
        from,
        to,
      });
      return undefined;
    }

    return await response.json();
  } catch (err) {
    console.error('callComputeRoutes: Aufruf fehlgeschlagen', err, {
      from,
      to,
    });
    return undefined;
  }
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
  const response = await callComputeRoutes(
    {
      origin: toWaypoint(from),
      destination: toWaypoint(to),
      travelMode: 'DRIVE',
      // Verkehrsabhängiges Routing fiele in eine teurere SKU und brächte für
      // eine im Nachhinein erfasste Fahrt ohnehin nichts.
      routingPreference: 'TRAFFIC_UNAWARE',
    },
    'routes.distanceMeters',
    from,
    to
  );
  if (!response) {
    return undefined;
  }

  const body = response as ComputeRoutesResponse;
  const distanceMeters = body.routes?.[0]?.distanceMeters;
  if (distanceMeters === undefined) {
    console.error(
      'computeRouteDistanceMeters: keine Route oder unerwartete Antwort',
      body,
      { from, to }
    );
  }
  return distanceMeters;
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

/**
 * Maximal 25 Wegpunkte je Anfrage: Die Routes API lässt bis zu 25
 * Zwischenpunkte zu, dazu kommen Start und Ziel. Wir bleiben mit 25 gesamt
 * unter der Grenze und sparen uns die Frage, ob Start und Ziel mitzählen.
 */
const MAX_WAYPOINTS_PER_REQUEST = 25;

export interface RoutedLeg {
  /**
   * Der Straßenverlauf des Abschnitts — beginnt und endet auf der Straße, nicht
   * beim übergebenen Punkt. Die Zuführung vom Punkt zur Straße ergänzt der
   * Aufrufer (siehe `stitchRoutedPositions`).
   */
  positions: LatLngPosition[];
  /** Straßenstrecke des Abschnitts in Metern, wie von Google gemessen. */
  distanceMeters: number;
}

interface GeoJsonLineString {
  type?: string;
  /** GeoJSON zählt `[lng, lat]`, nicht `[lat, lng]`. */
  coordinates?: [number, number][];
}

interface ComputeRoutesLegsResponse {
  routes?: {
    legs?: {
      distanceMeters?: number;
      polyline?: { geoJsonLinestring?: GeoJsonLineString };
    }[];
  }[];
}

function legFromResponse(leg: {
  distanceMeters?: number;
  polyline?: { geoJsonLinestring?: GeoJsonLineString };
}): RoutedLeg | undefined {
  const coordinates = leg.polyline?.geoJsonLinestring?.coordinates;
  if (!Array.isArray(coordinates) || coordinates.length < 2) {
    return undefined;
  }
  return {
    positions: coordinates.map(([lng, lat]) => [lat, lng] as LatLngPosition),
    // proto3 lässt die 0 in der JSON-Ausgabe weg — ein Abschnitt über 0 m ist
    // kein Fehler, sondern zwei Punkte an derselben Stelle.
    distanceMeters: leg.distanceMeters ?? 0,
  };
}

/**
 * Die Abschnitte einer Fußgänger-Route über die übergebenen Punkte, jeweils mit
 * Geometrie und Straßenstrecke — oder `undefined`, wenn der Dienst nicht
 * antwortet.
 *
 * Fußgänger-Profil, weil eine Schlauchleitung der Straße folgt, sich aber
 * weder an Einbahnen noch an Abbiegeverbote hält. `routingPreference` bleibt
 * deshalb weg: Die Routes API nimmt es nur für `DRIVE` und `TWO_WHEELER` an und
 * lehnt den Aufruf sonst ab.
 *
 * Wirft bewusst nicht: Fällt das Routing aus, zeichnet die Karte die direkte
 * Verbindung — eine Leitung darf daran nicht verloren gehen.
 */
export async function computeWalkingRouteLegs(
  points: GeoPositionObject[]
): Promise<RoutedLeg[] | undefined> {
  if (points.length < 2) {
    return [];
  }

  const legs: RoutedLeg[] = [];
  // Die Blöcke überlappen sich um einen Punkt, damit kein Abschnitt zwischen
  // zwei Anfragen verloren geht.
  for (
    let start = 0;
    start < points.length - 1;
    start += MAX_WAYPOINTS_PER_REQUEST - 1
  ) {
    const chunk = points.slice(start, start + MAX_WAYPOINTS_PER_REQUEST);
    const chunkLegs = await computeWalkingRouteLegsChunk(chunk);
    if (!chunkLegs) {
      return undefined;
    }
    legs.push(...chunkLegs);
  }

  return legs;
}

async function computeWalkingRouteLegsChunk(
  points: GeoPositionObject[]
): Promise<RoutedLeg[] | undefined> {
  const response = await callComputeRoutes(
    {
      origin: toWaypoint(points[0]),
      destination: toWaypoint(points[points.length - 1]),
      intermediates: points.slice(1, -1).map(toWaypoint),
      travelMode: 'WALK',
      // Ohne das kommt die Geometrie als kodierte Polyline zurück und müsste
      // erst dekodiert werden.
      polylineEncoding: 'GEO_JSON_LINESTRING',
    },
    'routes.legs.distanceMeters,routes.legs.polyline',
    points[0],
    points[points.length - 1]
  );
  if (!response) {
    return undefined;
  }

  const body = response as ComputeRoutesLegsResponse;
  const responseLegs = body.routes?.[0]?.legs;
  const expectedLegs = points.length - 1;
  if (!responseLegs || responseLegs.length !== expectedLegs) {
    console.error(
      'computeWalkingRouteLegs: keine Route oder unerwartete Antwort',
      body,
      { points }
    );
    return undefined;
  }

  const legs = responseLegs.map(legFromResponse);
  if (legs.some((leg) => leg === undefined)) {
    console.error('computeWalkingRouteLegs: Abschnitt ohne Geometrie', body, {
      points,
    });
    return undefined;
  }
  return legs as RoutedLeg[];
}
