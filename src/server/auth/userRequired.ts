import 'server-only';

import { DecodedIdToken } from 'firebase-admin/lib/auth/token-verifier';
import { NextRequest } from 'next/server';
import { ApiException } from '../../app/api/errors';
import { firestore, firebaseAuth } from '../firebase/admin';
import { USER_COLLECTION_ID } from '../../components/firebase/firestore';

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
    const decodedToken = await firebaseAuth.verifyIdToken(token);
    // console.log(`decoded token: ${JSON.stringify(decodedToken)}`);
    if (
      decodedToken.email &&
      decodedToken.email.indexOf('@ff-neusiedlamsee.at') > 0
    ) {
      // allow all internal users
      return decodedToken;
    }
    // fetch the user and check if this is an active user
    const userDoc = await firestore
      .collection(USER_COLLECTION_ID)
      .doc(decodedToken.sub)
      .get();
    if (!(userDoc.exists && userDoc.data()?.authorized === true)) {
      throw new ApiException('your user is not authorized', { status: 403 });
    }
    return decodedToken;
  } catch (err: any) {
    console.warn(`invalid token received: ${err} ${err.stack}`);
    throw new ApiException('invalid token');
  }
};

export default userRequired;
