// Next.js API route support: https://nextjs.org/docs/api-routes/introduction
import type { NextApiRequest, NextApiResponse } from 'next';
import { firestore } from '../firebase/admin';

const tokenRequired = async (
  req: NextApiRequest,
  res: NextApiResponse<any>
) => {
  let token = `${req.query.token}`;
  if (!token) {
    const { authorization } = req.headers;
    if (!authorization) {
      res.status(401).json({ error: 'Unauthorized' });
      return false;
    }
    if (authorization.indexOf(`Bearer `) > 0) {
      token = authorization.replace('Bearer ', '');
    }
  }
  if (!token) {
    res.status(401).json({ error: 'Unauthorized' });
    return false;
  }

  const tokenDoc = await firestore.collection('tokens').doc(token).get();
  if (!tokenDoc.exists) {
    res.status(403).json({ error: 'token invalid' });
    return false;
  }
  return tokenDoc.data();
};

export default tokenRequired;
