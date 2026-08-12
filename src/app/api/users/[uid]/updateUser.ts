import 'server-only';

import { uniqueArray } from '../../../../common/arrayUtils';
import { isTruthy } from '../../../../common/boolish';
import { feuerwehren } from '../../../../common/feuerwehren';
import { isFirecallGuest } from '../../../../common/firecallGuest';
import { UserRecordExtended } from '../../../../common/users';
import { USER_COLLECTION_ID } from '../../../../components/firebase/firestore';
import { firebaseAuth, firestore } from '../../../../server/firebase/admin';
import { userSessionCache } from '../../../../server/auth/userSessionCache';

export interface UsersResponse {
  user: UserRecordExtended;
}

export async function updateUser(uid: string, user: UserRecordExtended) {
  const newData = {
    displayName: user.displayName,
    email: user.email,
    authorized: isTruthy(user.authorized),
    isAdmin: !!user.isAdmin,
    feuerwehr: user.feuerwehr || 'neusiedl',
    abschnitt: feuerwehren[user.feuerwehr || 'neusiedl'].abschnitt || 0,
    groups: uniqueArray([...(user.groups || []), 'allUsers']),
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

  await firestore
    .collection(USER_COLLECTION_ID)
    .doc(`${uid}`)
    .set(filteredData, {
      merge: true,
    });

  setCustomClaimsForUser(uid, {
    groups: newData.groups,
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

  return newData;
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
