'use server';

import { FIRECALL_COLLECTION_ID } from '../../components/firebase/firestore';
import { firestore } from '../../server/firebase/admin';
import { checkAuth } from '../firebaseAuth';

// this is a sample server side action,
// which can be called directly from the client without an API endpoint
export async function sayHello(text: string) {
  const userInfo = await checkAuth();
  console.info(
    `loggedin user on serverside action: ${JSON.stringify(userInfo)}`
  );
  const docs = await firestore
    .collection(FIRECALL_COLLECTION_ID)
    .where('deleted', '==', false)
    .orderBy('date', 'desc')
    .limit(1)
    .get();
  return {
    message: `hey ho ${text}. last firecall: `,
    firecall: { id: docs.docs[0].id, ...docs.docs[0].data() },
    user: userInfo,
  };
}
