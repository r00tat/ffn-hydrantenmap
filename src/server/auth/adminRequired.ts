import { NextRequest } from 'next/server';
import { ApiException } from '../../app/api/errors';
import { firestore, firebaseAuth } from '../firebase/admin';
import { USER_COLLECTION_ID } from '../../components/firebase/firestore';

const adminRequired = async (req: NextRequest) => {
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

    const userDoc = await firestore
      .collection(USER_COLLECTION_ID)
      .doc(decodedToken.sub)
      .get();
    if (!(userDoc.exists && userDoc.data()?.isAdmin === true)) {
      throw new ApiException('your user is not an admin', { status: 403 });
    }

    return decodedToken;
  } catch (err: any) {
    console.warn(`invalid token received: ${err} ${err.stack}`);
    throw new ApiException('invalid token', { status: 403 });
  }
};

export default adminRequired;
