import { NextRequest } from 'next/server';
import { ApiException } from '../../app/api/errors';
import firebaseAdmin, { firestore } from '../firebase/admin';

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
    const decodedToken = await firebaseAdmin.auth().verifyIdToken(token);

    const userDoc = await firestore
      .collection('user')
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
