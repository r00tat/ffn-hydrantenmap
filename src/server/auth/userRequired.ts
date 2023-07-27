// Next.js API route support: https://nextjs.org/docs/api-routes/introduction
import type { NextApiRequest, NextApiResponse } from 'next';
import firebaseAdmin from '../firebase/admin';

const userRequired = async (req: NextApiRequest, res: NextApiResponse<any>) => {
  const { authorization } = req.headers;
  if (!authorization) {
    res.status(401).json({ error: 'Unauthorized' });
    return false;
  }
  if (authorization.indexOf(`Bearer `) < 0) {
    res.status(403).json({ error: 'Bearer token required' });
    return false;
  }
  const token = authorization.replace('Bearer ', '');
  try {
    const decodedToken = await firebaseAdmin.auth().verifyIdToken(token);
    // console.log(`decoded token: ${JSON.stringify(decodedToken)}`);
    // if (decodedToken.email !== 'paul.woelfel@ff-neusiedlamsee.at') {
    //   res.status(403).json({ error: 'Forbidden' });
    //   return false;
    // }
    if (
      decodedToken.email &&
      decodedToken.email.indexOf('@ff-neusiedlamsee.at') > 0
    ) {
      // allow all internal users
      return decodedToken;
    }
    // fetch the user and check if this is an active user
    const firestore = firebaseAdmin.firestore();
    const userDoc = await firestore
      .collection('user')
      .doc(decodedToken.sub)
      .get();
    if (!(userDoc.exists && userDoc.data()?.authorized === true)) {
      res.status(403).json({ error: 'your user is not authorized' });
      return false;
    }
    return decodedToken;
  } catch (err: any) {
    console.warn(`invalid token received: ${err} ${err.stack}`);
    res.status(403).json({ error: 'invalid token' });
    return false;
  }
};

export default userRequired;
