/**
 * Kennzeichnung der Dev-Variante im Titel.
 *
 * Die App läuft in zwei Umgebungen, die sonst identisch aussehen. Wer beide als
 * PWA installiert oder in mehreren Tabs offen hat, muss am Namen erkennen
 * können, wo er gerade schreibt — in dev angelegte Einträge fehlen im echten
 * Einsatz.
 *
 * Signal ist `NEXT_PUBLIC_FIRESTORE_DB`: in prod leer (der Deploy-Workflow
 * normalisiert `default`/`(default)` auf den leeren String), in dev und lokal
 * `ffndev`. Damit gilt der lokale Entwicklungsserver bewusst ebenfalls als
 * Dev-Variante. Eine eigene `NEXT_PUBLIC_APP_ENV` wäre besser benannt, müsste
 * aber in Dockerfile, Deploy-Workflow, beiden Terraform-Umgebungen und
 * `.env.local` nachgezogen werden (siehe `publicBuildEnv.test.ts`) — für einen
 * Namen zu viel Kette.
 */

/**
 * Vorangestellt, nicht angehängt: Browser-Tabs und Homescreen-Labels schneiden
 * hinten ab, und „Einsatzkarte" füllt das Label schon allein aus.
 */
export const DEV_TITLE_PREFIX = '🚧 DEV ';

export function isDevEnvironment(): boolean {
  return !!process.env.NEXT_PUBLIC_FIRESTORE_DB;
}

/** Stellt einem Titel die Umgebungskennzeichnung voran — in prod unverändert. */
export function withEnvironmentPrefix(title: string): string {
  return isDevEnvironment() ? `${DEV_TITLE_PREFIX}${title}` : title;
}
