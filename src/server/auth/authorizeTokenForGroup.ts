import 'server-only';

import { NextRequest } from 'next/server';
import tokenRequired from './tokenRequired';
import { firestore } from '../firebase/admin';
import { ApiException } from '../../app/api/errors';
import { USER_COLLECTION_ID } from '../../components/firebase/firestore';
import { FirebaseUserInfo } from '../../common/users';

export interface TokenGroupAuth {
  owner: string;
  isAdmin: boolean;
  groups: string[];
}

/**
 * Verifies the bearer token and that its owner is a member of `groupId`
 * (admins bypass the membership check). Mirrors the interactive group check
 * used by the UI-facing server actions. Throws ApiException on any failure.
 */
export async function authorizeTokenForGroup(
  req: NextRequest,
  groupId: string,
): Promise<TokenGroupAuth> {
  const tokenData = await tokenRequired(req);
  const owner: string | undefined = tokenData?.owner;
  if (!owner) {
    throw new ApiException('token has no owner', { status: 403 });
  }

  const userDoc = await firestore
    .collection(USER_COLLECTION_ID)
    .doc(owner)
    .get();
  const userData = userDoc.data() as FirebaseUserInfo | undefined;
  const isAdmin = !!userData?.isAdmin;
  const groups: string[] = userData?.groups ?? [];

  if (!isAdmin && !groups.includes(groupId)) {
    throw new ApiException(
      `token owner ${owner} is not authorized for group ${groupId}`,
      { status: 403 },
    );
  }

  return { owner, isAdmin, groups };
}

export default authorizeTokenForGroup;
