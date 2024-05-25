import { NextRequest } from 'next/server';
import { ApiException } from '../../app/api/errors';
import firebaseAdmin from '../firebase/admin';

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
    // console.log(`decoded token: ${JSON.stringify(decodedToken)}`);
    if (decodedToken.email !== 'paul.woelfel@ff-neusiedlamsee.at') {
      throw new ApiException('Forbidden', { status: 403 });
    }
    return decodedToken;
  } catch (err: any) {
    console.warn(`invalid token received: ${err} ${err.stack}`);
    throw new ApiException('invalid token', { status: 403 });
  }
};

export default adminRequired;
