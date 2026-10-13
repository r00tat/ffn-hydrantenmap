import 'server-only';

import { uniqueArray } from '../../common/arrayUtils';
import { guestCanWrite } from '../../common/firecallGuest';
import { isInternalEmail } from '../../common/internalDomains';
import {
  memberGroupIds,
  ROLES_CATALOG_VERSION,
  type GroupRoles,
} from '../../common/permissions';
import { ALL_USERS_GROUP_ID } from '../../common/tenantGroups';
import { FirebaseUserInfo } from '../../common/users';
import { USER_COLLECTION_ID } from '../../components/firebase/firestore';
import { firebaseAuth, firestore } from '../firebase/admin';
import { recomputeUserPermissions, writeUserRoles } from './userRoles';
import { userSessionCache } from './userSessionCache';

const DEFAULT_INTERNAL_GROUP = 'ffnd';
const DEFAULT_FEUERWEHR = 'neusiedl';
const DEFAULT_ABSCHNITT = 1;

export interface AutoProvisionedUser {
  isAuthorized: boolean;
  isAdmin: boolean;
  /** Abgeleitet: Mitgliedsgruppen aus `groupRoles` plus `allUsers`. */
  groups: string[];
  /** Rollen je Gruppe, siehe `src/common/permissions.ts`. */
  groupRoles: GroupRoles;
  firecall?: string;
  /** Schreibrecht eines Einsatz-Gasts, siehe `guestCanWrite`. */
  firecallWrite?: boolean;
  /** Ablauf des Gastzugangs in Millisekunden, siehe `shareLinkStatus`. */
  firecallExpiresAt?: number;
}

/**
 * Auto-provision a user with @ff-neusiedlamsee.at email address.
 * Creates their Firestore document with authorization and FFND group membership,
 * and sets Firebase custom claims for immediate Firestore rules access.
 */
export async function autoProvisionInternalUser(
  uid: string,
  email: string,
  displayName?: string | null
): Promise<AutoProvisionedUser> {
  const groupRoles: GroupRoles = { [DEFAULT_INTERNAL_GROUP]: [] };
  const groups = sessionGroups(groupRoles);

  const userData = {
    displayName: displayName || '',
    email,
    authorized: true,
    feuerwehr: DEFAULT_FEUERWEHR,
    abschnitt: DEFAULT_ABSCHNITT,
    groups,
  };

  // Create user document in Firestore. `groups` bleibt bis zum Aufräumschritt
  // der Migration stehen, damit ein Rollback auf das vorige Release den
  // Benutzer weiter als Mitglied sieht.
  await firestore.collection(USER_COLLECTION_ID).doc(uid).set(userData);
  // Rollen samt der abgeleiteten Rechte für die Firestore-Regeln nur über den
  // einzigen Schreibweg; er verlangt das bestehende Dokument.
  await writeUserRoles(uid, { kind: 'replaceAll', groupRoles });

  // Set custom claims for Firestore rules to work immediately
  await firebaseAuth.setCustomUserClaims(uid, {
    groups,
    isAdmin: false,
    authorized: true,
  });

  console.info(`Auto-provisioned internal user ${email} with ${DEFAULT_INTERNAL_GROUP} group`);

  userSessionCache.invalidate(uid);

  return {
    isAuthorized: true,
    isAdmin: false,
    groups,
    groupRoles,
  };
}

/**
 * Die abgeleitete Gruppenliste der Sitzung: Mitgliedsgruppen aus
 * `groupRoles` plus `allUsers`, damit bestehende Leser von `groups`
 * unverändert funktionieren.
 */
export function sessionGroups(groupRoles: GroupRoles): string[] {
  return uniqueArray([ALL_USERS_GROUP_ID, ...memberGroupIds({ groupRoles })]);
}

/**
 * Ensure internal users are provisioned during sign-in.
 * This should be called from the authorize callback so claims are set
 * BEFORE the sign-in completes, allowing immediate token refresh.
 */
export async function ensureUserProvisioned(
  uid: string,
  email: string | null | undefined,
  displayName?: string | null
): Promise<void> {
  // Only auto-provision internal users
  if (!isInternalEmail(email)) {
    return;
  }

  // Skip Firestore check for users we've already seen
  if (userSessionCache.isKnownUser(uid)) {
    return;
  }

  const userInfo = await firestore
    .collection(USER_COLLECTION_ID)
    .doc(uid)
    .get();

  // If user already exists, no need to provision
  if (userInfo.exists) {
    userSessionCache.markKnownUser(uid);
    return;
  }

  await autoProvisionInternalUser(uid, email!, displayName);
  userSessionCache.markKnownUser(uid);
}

/**
 * Get user session data from Firestore, auto-provisioning internal users if needed.
 * Returns undefined if user document doesn't exist and user is not eligible for auto-provisioning.
 */
export async function getUserSessionData(
  uid: string,
  email: string | null | undefined,
  displayName?: string | null
): Promise<AutoProvisionedUser | undefined> {
  const cached = userSessionCache.get(uid);
  if (cached) {
    return cached;
  }

  const userInfo = await firestore
    .collection(USER_COLLECTION_ID)
    .doc(uid)
    .get();

  if (userInfo.exists) {
    const userData = userInfo.data() as FirebaseUserInfo;
    // Bewusst keine Rückfallebene auf die alten Felder: Ohne Migration hat der
    // Benutzer keine Gruppen (siehe Spec „Zeitfenster"). Die Regeln für
    // Einsätze lesen den unveränderten Claim und laufen weiter.
    const groupRoles: GroupRoles =
      userData.groupRoles && typeof userData.groupRoles === 'object'
        ? userData.groupRoles
        : {};
    if (
      userData.groupRoles &&
      (userData.rolesCatalogVersion ?? 0) < ROLES_CATALOG_VERSION
    ) {
      // Best effort und nicht abgewartet: Server und Client rechnen ohnehin
      // aus `groupRoles` und dem Katalog, nur die Regeln hängen nach.
      recomputeUserPermissions(uid).catch((err) =>
        console.error(`failed to recompute permissions of ${uid}`, err),
      );
    }
    const result = {
      isAuthorized: !!userData.authorized,
      isAdmin: !!userData.isAdmin,
      groups: sessionGroups(groupRoles),
      groupRoles,
      firecall: userData.firecall,
      firecallWrite: guestCanWrite(userData),
      firecallExpiresAt: userData.firecallExpiresAt,
    };
    userSessionCache.set(uid, result);
    return result;
  }

  // Auto-provision internal users (fallback if not done in authorize)
  if (isInternalEmail(email)) {
    const result = await autoProvisionInternalUser(uid, email!, displayName);
    userSessionCache.set(uid, result);
    return result;
  }

  return undefined;
}
