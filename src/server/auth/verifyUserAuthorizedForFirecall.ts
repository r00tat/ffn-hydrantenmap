import 'server-only';
import { DecodedIdToken } from 'firebase-admin/auth';
import { ApiException } from '../../app/api/errors';
import {
  Firecall,
  FIRECALL_COLLECTION_ID,
  USER_COLLECTION_ID,
} from '../../components/firebase/firestore';
import { FirebaseUserInfo } from '../../common/users';
import { guestCanWrite } from '../../common/firecallGuest';
import { shareLinkStatus } from '../../common/firecallShareLink';
import { firestore } from '../firebase/admin';

/**
 * Route-handler equivalent of `actionUserAuthorizedForFirecall`. Verifies that
 * the authenticated user (already resolved via `userRequired`) is authorized
 * for the given firecall, either through group membership or an explicit
 * single-firecall guest claim. Throws an `ApiException` otherwise and returns
 * the firecall data on success.
 */
export interface VerifyFirecallOptions {
  /**
   * Für schreibende Endpunkte setzen. Einsatz-Gäste ohne Schreibrecht werden
   * dann abgewiesen; Benutzer mit Gruppenzugriff sind nicht betroffen.
   */
  requireWrite?: boolean;
}

export async function verifyUserAuthorizedForFirecall(
  user: DecodedIdToken,
  firecallId: string,
  options: VerifyFirecallOptions = {}
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
  const isGroupMember = userGroups.includes(firecallData.group);

  if (!isGroupMember && userFirecall !== firecallId) {
    throw new ApiException(
      `user ${user.uid} is not authorized for firecall ${firecallId}`,
      { status: 403 }
    );
  }

  // Wie in `userAuthorized`: ein abgelaufener oder gesperrter Gastzugang gilt
  // nicht mehr, Gruppenmitglieder sind davon nicht betroffen.
  if (
    !isGroupMember &&
    shareLinkStatus(
      {
        expiresAt: userData?.firecallExpiresAt,
        disabled: !userData?.authorized,
      },
      Date.now()
    ) !== 'active'
  ) {
    throw new ApiException(
      `firecall guest ${user.uid} is expired or disabled for firecall ${firecallId}`,
      { status: 403 }
    );
  }

  if (options.requireWrite && !isGroupMember && !guestCanWrite(userData)) {
    throw new ApiException(
      `firecall guest ${user.uid} has read-only access to firecall ${firecallId}`,
      { status: 403 }
    );
  }

  return { id: firecallDoc.id, ...firecallData };
}

export default verifyUserAuthorizedForFirecall;
