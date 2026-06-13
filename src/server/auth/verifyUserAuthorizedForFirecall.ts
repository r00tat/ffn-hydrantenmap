import 'server-only';
import { DecodedIdToken } from 'firebase-admin/auth';
import { ApiException } from '../../app/api/errors';
import {
  Firecall,
  FIRECALL_COLLECTION_ID,
  USER_COLLECTION_ID,
} from '../../components/firebase/firestore';
import { FirebaseUserInfo } from '../../common/users';
import { firestore } from '../firebase/admin';

/**
 * Route-handler equivalent of `actionUserAuthorizedForFirecall`. Verifies that
 * the authenticated user (already resolved via `userRequired`) is authorized
 * for the given firecall, either through group membership or an explicit
 * single-firecall guest claim. Throws an `ApiException` otherwise and returns
 * the firecall data on success.
 */
export async function verifyUserAuthorizedForFirecall(
  user: DecodedIdToken,
  firecallId: string
): Promise<Firecall> {
  const firecallDoc = await firestore
    .collection(FIRECALL_COLLECTION_ID)
    .doc(firecallId)
    .get();
  if (!firecallDoc.exists) {
    throw new ApiException(`firecall ${firecallId} does not exist`, {
      status: 404,
    });
  }
  const firecallData = firecallDoc.data() as Firecall;
  if (!firecallData || !firecallData.group) {
    throw new ApiException(`firecall ${firecallId} has no group`, {
      status: 403,
    });
  }

  const userDoc = await firestore
    .collection(USER_COLLECTION_ID)
    .doc(user.uid)
    .get();
  const userData = userDoc.data() as FirebaseUserInfo | undefined;
  const userGroups: string[] = userData?.groups || [];
  const userFirecall: string | undefined = userData?.firecall;

  if (!userGroups.includes(firecallData.group) && userFirecall !== firecallId) {
    throw new ApiException(
      `user ${user.uid} is not authorized for firecall ${firecallId}`,
      { status: 403 }
    );
  }

  return { id: firecallDoc.id, ...firecallData };
}

export default verifyUserAuthorizedForFirecall;
