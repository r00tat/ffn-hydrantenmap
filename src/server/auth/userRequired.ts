import 'server-only';

import { DecodedIdToken } from 'firebase-admin/auth';
import { NextRequest } from 'next/server';
import { ApiException } from '../../app/api/errors';
import { firestore, firebaseAuth } from '../firebase/admin';
import { USER_COLLECTION_ID } from '../../components/firebase/firestore';
import { isInternalEmail } from '../../common/internalDomains';

const userRequired = async (req: NextRequest): Promise<DecodedIdToken> => {
  const authorization = req.headers.get('authorization');
  if (!authorization) {
    throw new ApiException('Unauthorized', { status: 401 });
  }
  if (authorization.indexOf(`Bearer `) < 0) {
    throw new ApiException('Bearer token required', { status: 403 });
  }
  const token = authorization.replace('Bearer ', '');
  try {
    // checkRevoked: reject tokens of disabled/revoked users immediately
    // instead of letting them work until the token expires (~1h).
    const decodedToken = await firebaseAuth.verifyIdToken(token, true);
    // console.log(`decoded token: ${JSON.stringify(decodedToken)}`);

    // fetch the user and check if this is an active user
    const userDoc = await firestore
      .collection(USER_COLLECTION_ID)
      .doc(decodedToken.sub)
      .get();
    if (userDoc.exists) {
      // An existing user doc is authoritative for everyone (including internal
      // users), so de-authorizing a user in Firestore takes effect.
      if (userDoc.data()?.authorized !== true) {
        throw new ApiException('your user is not authorized', { status: 403 });
      }
      return decodedToken;
    }
    // No user doc yet: internal users are auto-provisioned on first login,
    // so allow them through. Everyone else is unauthorized.
    if (isInternalEmail(decodedToken.email)) {
      return decodedToken;
    }
    throw new ApiException('your user is not authorized', { status: 403 });
  } catch (err: any) {
    console.warn(`invalid token received: ${err} ${err.stack}`);
    throw new ApiException('invalid token');
  }
};

export default userRequired;
