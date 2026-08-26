'use server';
import 'server-only';

import {
  listConnectedApplications,
  revokeApplicationAccess,
  type ConnectedApplication,
} from '../../server/oauth/store';
import { actionUserRequired } from '../auth';

/**
 * Die verbundenen Anwendungen des angemeldeten Benutzers.
 *
 * Bewusst ohne Parameter: Die Benutzerkennung kommt aus der Session, nicht aus
 * dem Aufruf — sonst könnte jeder die Liste eines anderen abfragen.
 */
export async function getConnectedApplications(): Promise<ConnectedApplication[]> {
  const session = await actionUserRequired();
  return listConnectedApplications(session.user.id);
}

/**
 * Widerruft den Zugriff einer Anwendung.
 *
 * Alle Refresh Tokens des Benutzers für diesen Client werden widerrufen und
 * die Einwilligung gelöscht. Bereits ausgestellte Access Tokens bleiben bis zu
 * ihrem Ablauf gültig (höchstens eine Stunde) — der Preis für die zustandslose
 * Prüfung am MCP-Endpunkt, siehe `docs/mcp-server.md`.
 */
export async function revokeConnectedApplication(
  clientId: string,
): Promise<{ revokedTokens: number }> {
  const session = await actionUserRequired();
  const revokedTokens = await revokeApplicationAccess(
    session.user.id,
    clientId,
  );
  console.info(
    `oauth: user ${session.user.id} revoked access for ${clientId} (${revokedTokens} tokens)`,
  );
  return { revokedTokens };
}
