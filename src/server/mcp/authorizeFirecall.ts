import 'server-only';

import { ApiException } from '../../app/api/errors';
import type { Firecall } from '../../components/firebase/firestore';
import { verifyUserAuthorizedForFirecall } from '../auth/verifyUserAuthorizedForFirecall';
import type { McpUser } from './userAccess';

/**
 * Die Einsatz-Schranke jedes Tool-Calls.
 *
 * **Kein Tool greift ohne diese Prüfung auf einen Einsatz zu.** Sie ist
 * dieselbe, die die Server Actions und die API-Routen verwenden: Der Zugriff
 * hängt an der Gruppe des Einsatzes und der Gruppenzugehörigkeit des
 * Benutzers. Der Scope des Tokens kann daran nichts ändern — er schneidet nur
 * weiter ein.
 */
export async function authorizeFirecall(
  user: McpUser,
  firecallId: string,
  options: { requireWrite?: boolean } = {},
): Promise<Firecall> {
  if (!firecallId) {
    throw new ApiException('firecallId is required', { status: 400 });
  }
  return verifyUserAuthorizedForFirecall(
    { uid: user.uid },
    firecallId,
    options,
  );
}

/** Die Meldung, die ein Tool bei einem Autorisierungsfehler zurückgibt. */
export function authorizationMessage(err: unknown): string {
  if (err instanceof ApiException) {
    return err.message;
  }
  return (err as Error)?.message ?? 'authorization failed';
}
