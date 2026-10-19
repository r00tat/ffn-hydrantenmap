import 'server-only';

import { uniqueArray } from '../../../../common/arrayUtils';
import { isTruthy } from '../../../../common/boolish';
import { feuerwehren } from '../../../../common/feuerwehren';
import { isFirecallGuest } from '../../../../common/firecallGuest';
import { withAncestorGroups } from '../../../../common/groupHierarchy';
import { isTenantGroupId } from '../../../../common/tenantGroups';
import {
  awaitsKostenersatzChoice,
  claimGroupsForUser,
  userMemberGroupIds,
} from '../../../../common/userGroupRoles';
import { FirebaseUserInfo, UserRecordExtended } from '../../../../common/users';
import { USER_COLLECTION_ID } from '../../../../components/firebase/firestore';
import { firebaseAuth, firestore } from '../../../../server/firebase/admin';
import { setUserMemberships } from '../../../../server/auth/changeUserRoles';
import { userSessionCache } from '../../../../server/auth/userSessionCache';
import { getGroups } from '../../../groups/groupHelpers';

export interface UsersResponse {
  user: UserRecordExtended;
}

/**
 * Stammdaten, Freischaltung und Admin-Flag eines Benutzers.
 *
 * Die Gruppen kommen **nicht** aus `user.groups`: Das alte Feld pflegt niemand
 * mehr, und wer nur die Freischaltung umschaltet, schickt es veraltet mit.
 * Die Mitgliedschaft ändert sich nur, wenn `memberGroupIds` übergeben wird,
 * und dann über `writeUserRoles()` (siehe `setUserMemberships`). Die
 * Elterngruppen der gewählten Gruppen kommen dabei immer dazu.
 */
export async function updateUser(
  uid: string,
  user: UserRecordExtended,
  requestedGroupIds?: string[]
) {
  const memberGroupIds = requestedGroupIds
    ? withAncestorGroups(requestedGroupIds, await getGroups())
    : undefined;
  const userRef = firestore.collection(USER_COLLECTION_ID).doc(`${uid}`);
  const stored = await userRef.get();
  const storedData = ((stored.exists ? stored.data() : undefined) ??
    {}) as FirebaseUserInfo;

  // Vor jedem Schreibvorgang, damit nichts halb gespeichert bleibt: Die
  // Umrechnung gäbe ihm Kostenersatz in jeder Gruppe, und Schritt 2 der
  // Migration überspränge ihn danach samt der Auswahl je Gruppe.
  if (
    memberGroupIds &&
    awaitsKostenersatzChoice(storedData) &&
    !sameGroups(userMemberGroupIds(storedData), memberGroupIds)
  ) {
    return { error: 'notMigrated' as const };
  }

  const newData = {
    displayName: user.displayName,
    email: user.email,
    authorized: isTruthy(user.authorized),
    isAdmin: !!user.isAdmin,
    feuerwehr: user.feuerwehr || 'neusiedl',
    abschnitt: feuerwehren[user.feuerwehr || 'neusiedl'].abschnitt || 0,
    // Nur für Einsatz-Gäste relevant. Bei allen anderen Benutzern bleibt das
    // Feld undefined und wird von `filteredData` unten herausgefiltert, damit
    // ein merge-Write kein bestehendes Feld überschreibt.
    firecallWrite: isFirecallGuest(user) ? !!user.firecallWrite : undefined,
    // Wie `firecallWrite`: bei Nicht-Gästen undefined, damit `filteredData` das
    // Feld herausfiltert und ein merge-Write nichts überschreibt.
    firecallExpiresAt: isFirecallGuest(user)
      ? user.firecallExpiresAt
      : undefined,
  };

  const filteredData = Object.fromEntries(
    Object.entries(newData).filter(([key, value]) => key && value !== undefined)
  );

  console.info(
    `updating user ${uid} (auth: ${user.authorized ? 'Y' : 'N'} ${
      filteredData.authorized ? 'Y' : 'N'
    }): ${JSON.stringify(filteredData)}`
  );

  await userRef.set(filteredData, {
    merge: true,
  });

  const groupRoles = memberGroupIds
    ? await setUserMemberships(uid, memberGroupIds, storedData)
    : undefined;

  setCustomClaimsForUser(uid, {
    // Aus dem gespeicherten Dokument, nicht aus dem Client: siehe oben.
    groups: claimGroupsForUser(storedData, groupRoles),
    isAdmin: newData.isAdmin,
    authorized: newData.authorized,
    ...(isFirecallGuest(user)
      ? {
          firecall: user.firecall,
          firecallWrite: !!user.firecallWrite,
          // Ohne diese Zeile löschte jede Admin-Bearbeitung in der
          // Benutzerverwaltung den Ablauf-Claim — der Gastzugang wäre danach
          // aus Sicht der Firestore-Rules unbegrenzt gültig.
          firecallExpires: user.firecallExpiresAt,
        }
      : {}),
  });

  // Die Session liest Autorisierung und Schreibrecht über einen Cache. Ohne
  // Invalidierung bliebe eine Admin-Änderung bis zum Cache-Ablauf wirkungslos.
  userSessionCache.invalidate(uid);

  return { ...newData, ...(groupRoles ? { groupRoles } : {}) };
}

function sameGroups(current: string[], desired: string[]) {
  const a = new Set(current);
  const b = new Set(desired.filter(isTenantGroupId));
  return a.size === b.size && [...a].every((groupId) => b.has(groupId));
}

export interface CustomClaims {
  groups: string[];
  isAdmin: boolean;
  authorized: boolean;
  firecall?: string;
  firecallWrite?: boolean;
  /**
   * Ablauf des Gastzugangs in Millisekunden. Die Firestore-Rules vergleichen
   * ihn gegen `request.time` und sperren abgelaufene Gäste, ohne dafür das
   * Benutzerdokument lesen zu müssen.
   */
  firecallExpires?: number;
}

export async function setCustomClaimsForUser(uid: string, user: CustomClaims) {
  const customClaims: CustomClaims = {
    groups: uniqueArray([...(user.groups || []), 'allUsers']),
    isAdmin: !!user.isAdmin,
    authorized: !!user.authorized,
    // Einsatz-Gast-Claims nur setzen, wenn vorhanden — `undefined` ist als
    // Custom Claim nicht erlaubt.
    ...(user.firecall
      ? {
          firecall: user.firecall,
          firecallWrite: user.firecallWrite !== false,
          ...(user.firecallExpires
            ? { firecallExpires: user.firecallExpires }
            : {}),
        }
      : {}),
  };
  console.info(
    `setting custom claims for ${uid}: ${JSON.stringify(customClaims)}`
  );
  await firebaseAuth.setCustomUserClaims(uid, customClaims);

  return customClaims;
}
