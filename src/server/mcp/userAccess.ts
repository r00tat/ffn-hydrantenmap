import 'server-only';

import { uniqueArray } from '../../common/arrayUtils';
import { isFirecallGuest } from '../../common/firecallGuest';
import { FirebaseUserInfo } from '../../common/users';
import { USER_COLLECTION_ID } from '../../components/firebase/firestore';
import { firestore } from '../firebase/admin';

/**
 * Wer darf über MCP zugreifen — und mit welchen Rechten?
 *
 * Die Prüfung läuft bei **jedem** Token-Tausch und bei **jedem** Tool-Call
 * gegen das Benutzerdokument, nicht gegen den Token-Inhalt. Ein Access Token
 * lebt eine Stunde; wer in dieser Stunde die Berechtigung verliert, darf nicht
 * bis zum Ablauf weiterarbeiten.
 *
 * Einsatz-Gäste sind ausgenommen (offene Frage 1 aus #730).
 */

export interface McpUser {
  uid: string;
  isAdmin: boolean;
  groups: string[];
  fahrtenbuchGeraetemeister: string[];
  groupAdmin: string[];
}

export class McpUserAccessError extends Error {
  readonly status: number;
  constructor(message: string, status = 403) {
    super(message);
    this.status = status;
  }
}

export async function loadMcpUser(uid: string): Promise<McpUser> {
  const doc = await firestore.collection(USER_COLLECTION_ID).doc(uid).get();
  if (!doc.exists) {
    throw new McpUserAccessError(`user ${uid} does not exist`);
  }
  const data = doc.data() as FirebaseUserInfo;

  if (data.authorized !== true) {
    throw new McpUserAccessError(`user ${uid} is not authorized`);
  }

  if (isFirecallGuest(data)) {
    throw new McpUserAccessError(
      'firecall guests cannot use the MCP interface',
    );
  }

  return {
    uid,
    isAdmin: !!data.isAdmin,
    groups: uniqueArray(['allUsers', ...(data.groups || [])]),
    fahrtenbuchGeraetemeister: data.fahrtenbuchGeraetemeister ?? [],
    groupAdmin: data.groupAdmin ?? [],
  };
}
