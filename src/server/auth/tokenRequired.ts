import 'server-only';

import { NextRequest } from 'next/server';
import { ApiException } from '../../app/api/errors';
import { firestore } from '../firebase/admin';

const tokenRequired = async (req: NextRequest) => {
  const authorization = req.headers.get('authorization');
  if (!authorization) {
    throw new ApiException('Unauthorized', { status: 401 });
  }
  if (authorization.indexOf(`Bearer `) < 0) {
    throw new ApiException('Bearer token required', { status: 403 });
  }
  const token = authorization.replace('Bearer ', '');
  if (!token) {
    throw new ApiException('Unauthorized', { status: 401 });
  }

  try {
    const tokenDoc = await firestore.collection('tokens').doc(token).get();
    if (!tokenDoc.exists) {
      throw new ApiException('token invalid', { status: 403 });
    }
    return tokenDoc.data();
  } catch (err) {
    console.error(`failed to query firestore ${err}`);
    throw new ApiException('token invalid', { status: 403 });
  }
};

export default tokenRequired;
