'use server';
import 'server-only';

import {
  deleteClient,
  listAllGrants,
  listClients,
  revokeApplicationAccess,
  type AdminGrant,
} from '../../../server/oauth/store';
import type { OAuthClient } from '../../../server/oauth/types';
import { actionAdminRequired } from '../../auth';

/** Registrierte Anwendungen — ohne den Secret-Hash. */
export type AdminClient = Omit<OAuthClient, 'client_secret_hash'>;

export async function getMcpClients(): Promise<AdminClient[]> {
  await actionAdminRequired();
  return (await listClients()).map(({ client_secret_hash: _hash, ...rest }) => rest);
}

export async function getMcpGrants(): Promise<AdminGrant[]> {
  await actionAdminRequired();
  return listAllGrants();
}

/**
 * Löscht eine Registrierung.
 *
 * Bestehende Zugänge dieser Anwendung werden damit ungültig: Der
 * Token-Endpunkt löst die `client_id` bei jedem Refresh neu auf und findet sie
 * dann nicht mehr.
 */
export async function deleteMcpClient(clientId: string): Promise<void> {
  await actionAdminRequired();
  await deleteClient(clientId);
  console.info(`oauth admin: client ${clientId} deleted`);
}

export async function revokeMcpGrant(
  userId: string,
  clientId: string,
): Promise<{ revokedTokens: number }> {
  await actionAdminRequired();
  const revokedTokens = await revokeApplicationAccess(userId, clientId);
  console.info(
    `oauth admin: revoked ${clientId} for ${userId} (${revokedTokens} tokens)`,
  );
  return { revokedTokens };
}
