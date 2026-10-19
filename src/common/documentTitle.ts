import { withEnvironmentPrefix } from './appEnvironment';

/** Name der App im Browser-Tab, ohne Umgebungskennzeichnung. */
export const APP_NAME = 'Einsatzkarte FFN';

/**
 * Tab-Titel einer Seite: „Einsatzmittel - Einsatzkarte FFN". Mit mehreren
 * offenen Tabs sonst nicht unterscheidbar, weil alle nur den App-Namen
 * trugen. Die Seite steht vorne, weil Tabs hinten abschneiden; die
 * Dev-Kennzeichnung bleibt trotzdem davor (s. `appEnvironment.ts`).
 */
export function buildDocumentTitle(pageName?: string): string {
  const name = pageName?.trim();
  return withEnvironmentPrefix(name ? `${name} - ${APP_NAME}` : APP_NAME);
}
