import 'server-only';

import { uniqueArray } from '../../common/arrayUtils';
import { isInternalEmail } from '../../common/internalDomains';
import { FirebaseUserInfo } from '../../common/users';
import { USER_COLLECTION_ID } from '../../components/firebase/firestore';
import { firebaseAuth, firestore } from '../firebase/admin';
import { userSessionCache } from './userSessionCache';

const DEFAULT_INTERNAL_GROUP = 'ffnd';
const DEFAULT_FEUERWEHR = 'neusiedl';
const DEFAULT_ABSCHNITT = 1;

export interface AutoProvisionedUser {
  isAuthorized: boolean;
  isAdmin: boolean;
  groups: string[];
  firecall?: string;
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
  const groups = uniqueArray(['allUsers', DEFAULT_INTERNAL_GROUP]);

  const userData = {
    displayName: displayName || '',
    email,
    authorized: true,
    feuerwehr: DEFAULT_FEUERWEHR,
    abschnitt: DEFAULT_ABSCHNITT,
    groups,
  };

  // Create user document in Firestore
  await firestore.collection(USER_COLLECTION_ID).doc(uid).set(userData);

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
  };
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
    const result = {
      isAuthorized: !!userData.authorized,
      isAdmin: !!userData.isAdmin,
      groups: uniqueArray(['allUsers', ...(userData.groups || [])]),
      firecall: userData.firecall,
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
