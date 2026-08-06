import { ApiException } from '../../app/api/errors';

/**
 * Übersetzt eine geworfene Ausnahme in einen Fehlerschlüssel unter
 * `fahrtenbuch.errors`. Ohne diese Zuordnung landete der englische Text der
 * `ApiException` ("user is not a member of group ffnd") ungefiltert in der
 * deutschen Oberfläche. Der Originalfehler bleibt im Serverlog.
 *
 * Steht in einem eigenen Modul und nicht in `fahrtenbuchActions.ts`: Aus einer
 * `'use server'`-Datei darf nur exportiert werden, was eine Action sein soll —
 * jeder Export wird dort zu einem aufrufbaren Endpunkt.
 */
export function actionErrorKey(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err);
  if (
    /not a member of group/.test(message) ||
    /is not a valid Fahrtenbuch group/.test(message)
  ) {
    return 'notInGroup';
  }
  // `actionUserRequired` wirft bei fehlender Anmeldung oder entzogener
  // Freigabe eine übersetzte Meldung — der Status ist das verlässliche Signal.
  if (err instanceof ApiException && (err.status === 401 || err.status === 403)) {
    return 'notLoggedIn';
  }
  return message;
}
