/**
 * Seiten der App-Shell für den Betrieb ohne Netz (`src/worker/appShell.ts`).
 *
 * Vorgehalten wird nur das HTML, das die App startet; die Inhalte kommen aus
 * Firestore. Jede Seite unter `src/app` steht entweder hier oder in
 * `APP_SHELL_EXCLUDED_ROUTES` — `appShellRoutes.test.ts` prüft das gegen das
 * Dateisystem. Wer offline navigiert, soll keinen Unterschied merken; eine
 * neue Seite, die hier fehlt, landete ohne Netz auf `/offline`.
 *
 * Bewusst ohne `'use client'`: Seite und Service Worker lesen dieselbe Liste.
 */

/** Seiten ohne Einsatzbezug, vollständig bis auf die Ausnahmen unten. */
export const APP_SHELL_PAGES: readonly string[] = [
  '/',
  '/map',
  '/einsaetze',
  '/tagebuch',
  '/atemschutz',
  '/atemschutz/fuellprotokoll',
  '/atemschutz/verrechnung',
  '/atemschutzueberwachung',
  '/einsatzmittel',
  '/einsatzorte',
  '/geschaeftsbuch',
  '/ebenen',
  '/chat',
  '/print',
  '/sybos',
  '/loeschwasserversorgung',
  '/dammbau',
  '/hochwasser',
  '/schadstoff',
  '/schadstoff/datenbank',
  '/schadstoff/dosimetrie',
  '/schadstoff/energiespektrum',
  '/schadstoff/strahlenschutz',
  '/kostenersatz',
  '/fahrtenbuch',
  '/fahrtenbuch/maengel',
  '/fahrtenbuch/statistik',
  '/fahrzeuge',
  '/geraete',
  '/kennzeichen',
  '/rettungskarten',
  '/blaulicht-sms',
  '/ai',
  '/profile',
  '/groups',
  '/users',
  '/tokens',
  '/verbundene-anwendungen',
  '/auditlog',
  '/about',
  '/datenschutz',
  '/docs',
  '/docs/admin',
  '/docs/blaulicht-sms',
  '/docs/chat',
  '/docs/drucken',
  '/docs/ebenen',
  '/docs/einsaetze',
  '/docs/einsatzmittel',
  '/docs/einsatzorte',
  '/docs/energiespektrum',
  '/docs/fahrtenbuch',
  '/docs/fahrzeuge',
  '/docs/geraete',
  '/docs/geschaeftsbuch',
  '/docs/karte',
  '/docs/ki',
  '/docs/kostenersatz',
  '/docs/mcp',
  '/docs/offline',
  '/docs/quickstart',
  '/docs/schadstoff',
  '/docs/strahlenschutz',
  '/docs/sybos',
  '/docs/tagebuch',
  '/docs/wetter',
  '/offline',
];

/**
 * Abschnitte unter `/einsatz/<id>/<section>`. Die Seite
 * `src/app/einsatz/[firecallId]/[section]/page.tsx` typisiert ihre Registry
 * mit diesem Namen; ein neuer Abschnitt ohne Eintrag hier ist ein Typfehler.
 */
export const FIRECALL_SECTION_NAMES = [
  'ebenen',
  'tagebuch',
  'einsatzmittel',
  'geschaeftsbuch',
  'einsatzorte',
  'chat',
  'print',
  'sybos',
  'details',
  'fahrtenbuch',
  'loeschwasserversorgung',
  'dammbau',
  'hochwasser',
  'atemschutz',
  'atemschutzueberwachung',
  'einsaetze',
  'geraete',
] as const;

export type FirecallSectionName = (typeof FIRECALL_SECTION_NAMES)[number];

/**
 * Pfade unterhalb von `/einsatz/<id>`, `''` ist die Einsatzseite selbst. Die
 * Seiten eines Einsatzes, der nie vorgewärmt wurde (etwa offline angelegt),
 * baut der Worker aus denen eines anderen (`findTemplateFallback`).
 */
export const APP_SHELL_FIRECALL_PATHS: readonly string[] = [
  '',
  ...FIRECALL_SECTION_NAMES.map((section) => `/${section}`),
  '/kostenersatz',
  '/kostenersatz/neu',
  '/schadstoff',
  '/schadstoff/datenbank',
  '/schadstoff/dosimetrie',
  '/schadstoff/energiespektrum',
  '/schadstoff/strahlenschutz',
];

/**
 * Routen, die nicht vorgehalten werden, mit Grund. Ein Eintrag gilt auch für
 * alles darunter.
 */
export const APP_SHELL_EXCLUDED_ROUTES: Readonly<Record<string, string>> = {
  '/login': 'Anmeldung braucht das Netz; ohne Netz greift der Zwischenspeicher der Anmeldung.',
  '/oauth': 'Zustimmung eines MCP-Clients, nur mit Netz sinnvoll.',
  '/admin': 'Verwaltung über Server Actions, nur mit Netz und nur für Admins.',
  '/undefined': 'Auffangseite für fehlerhafte Links, kein Navigationsziel.',
  '/atemschutz/verrechnung/[rechnungId]': 'Dynamische ID, beim Vorwärmen unbekannt.',
  '/fahrtenbuch/[groupId]': 'Dynamische IDs, beim Vorwärmen unbekannt.',
  '/fahrtenbuch/teilen': 'Gastseite mit Token, NetworkOnly-Regel im Worker.',
  '/wetter': 'Dynamische Station, die Messwerte kommen ohnehin nur online.',
  '/einsatz/[firecallId]/kostenersatz/[calculationId]':
    'Dynamische ID einer Berechnung, beim Vorwärmen unbekannt.',
};
