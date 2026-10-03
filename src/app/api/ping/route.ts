/**
 * Erreichbarkeitsprüfung für den Verbindungsstatus der App
 * (`src/lib/connectivity.ts`).
 *
 * Bewusst **ohne Anmeldung**: Der Status-Chip läuft auch vor dem Login und auf
 * öffentlichen Routen, und die Antwort verrät nichts außer „der Server ist da".
 * Kein Firestore, keine Sitzung — die Antwort soll in jedem Zustand des Servers
 * so billig wie möglich sein.
 *
 * `no-store`, damit weder Browser noch Proxy noch Service Worker eine alte
 * Antwort liefern und damit „online" vortäuschen. Der Service Worker hat dafür
 * zusätzlich eine eigene `NetworkOnly`-Regel (`src/worker/patterns.ts`).
 */
export const dynamic = 'force-dynamic';

function noContent(): Response {
  return new Response(null, {
    status: 204,
    headers: { 'Cache-Control': 'no-store, max-age=0' },
  });
}

export function GET(): Response {
  return noContent();
}

export function HEAD(): Response {
  return noContent();
}
