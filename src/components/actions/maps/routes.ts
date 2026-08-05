import 'server-only';

import { GoogleAuth, Impersonated } from 'google-auth-library';
import type { GeoPositionObject } from '../../../common/geo';
import { getGcpProjectId } from '../../../server/firebase/project';

const ROUTES_URL = 'https://routes.googleapis.com/directions/v2:computeRoutes';

// Der dokumentierte Autorisierungs-Scope für v2:computeRoutes. Die Routes API
// akzeptiert `cloud-platform` ausdrücklich nicht.
const ROUTES_SCOPE =
  'https://www.googleapis.com/auth/maps-platform.routespreferred';

// Für den Aufruf der IAM Credentials API, die das Maps-Token ausstellt.
const CLOUD_PLATFORM_SCOPE = 'https://www.googleapis.com/auth/cloud-platform';

/**
 * Die Maps Platform akzeptiert wahlweise API-Key oder OAuth. Wir nehmen OAuth
 * über den Service Account, damit kein weiteres Secret ins Deployment muss.
 *
 * Der Weg dorthin ist umständlicher als er aussieht: `new GoogleAuth({ scopes })`
 * bekommt in genau den beiden Umgebungen, die uns betreffen, **kein** Token mit
 * dem gewünschten Scope.
 *
 * - Auf Cloud Run ignoriert der Metadata-Server angeforderte Scopes und liefert
 *   immer das Standardtoken der Instanz (`cloud-platform`).
 * - Lokal mit `gcloud auth application-default login` liegen die Scopes zum
 *   Zeitpunkt des Logins fest; ein anderer lässt sich nachträglich nicht
 *   anfordern.
 *
 * In beiden Fällen geht der Aufruf hinaus und die Routes API antwortet mit
 * `403 ACCESS_TOKEN_SCOPE_INSUFFICIENT` — der Scope im Code ist dabei richtig,
 * nur trägt ihn das Token nicht. Nur ein Service-Account-JSON-Key könnte ein
 * beliebig gescoptes Token selbst signieren, und den wollen wir nicht.
 *
 * Deshalb der Umweg über die IAM Credentials API: Der Service Account
 * impersoniert sich selbst und lässt sich dabei ein Token mit dem Maps-Scope
 * ausstellen. Das funktioniert in beiden Umgebungen gleich und setzt
 * `roles/iam.serviceAccountTokenCreator` auf sich selbst voraus (siehe
 * `terraform/main.tf`).
 */
let auth: GoogleAuth | undefined;
function getAuth(): GoogleAuth {
  // Erst beim ersten Aufruf erzeugt: Vitest hebt die `vi.mock`-Factory über die
  // `const`-Deklarationen des Testmoduls, auf die sie zugreift — ein
  // `new GoogleAuth()` auf Modulebene liefe, während diese Bindungen noch in
  // ihrer temporalen Totzone liegen.
  if (!auth) {
    auth = new GoogleAuth({ scopes: [CLOUD_PLATFORM_SCOPE] });
  }
  return auth;
}

/**
 * Der Client, der das Maps-Token ausstellt. Wird über Aufrufe hinweg behalten,
 * weil er das ausgestellte Token bis kurz vor Ablauf cacht — sonst käme auf
 * jeden Routing-Aufruf ein zweiter an die IAM Credentials API.
 */
let tokenSource: Impersonated | undefined;

async function getRoutesToken(): Promise<string | undefined> {
  if (!tokenSource) {
    const googleAuth = getAuth();
    const [sourceClient, credentials] = await Promise.all([
      googleAuth.getClient(),
      googleAuth.getCredentials(),
    ]);
    // Ohne Service-Account-Identität gibt es kein Ziel für die Impersonation.
    // Das trifft etwa auf ein reines Nutzer-ADC ohne konfigurierten Service
    // Account zu; dort bleibt das Routing aus, statt mit einem untauglichen
    // Token loszulaufen.
    if (!credentials.client_email) {
      console.error(
        'computeRouteDistanceMeters: kein Service Account in den Credentials — ' +
          'Routing braucht eine SA-Identität, die sich selbst impersonieren kann',
      );
      return undefined;
    }
    tokenSource = new Impersonated({
      sourceClient,
      targetPrincipal: credentials.client_email,
      targetScopes: [ROUTES_SCOPE],
      lifetime: 3600,
    });
  }

  const { token } = await tokenSource.getAccessToken();
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
