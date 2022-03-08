import * as firebaseAdmin from 'firebase-admin';

// let serviceAccount: process.env.GOOGLE_APPLICATION_CREDENTIALS;

if (firebaseAdmin.apps?.length == 0) {
  // make sure we initialize only once
  firebaseAdmin.initializeApp({
    // credential: admin.credential.cert(serviceAccount),
  });
}

export default firebaseAdmin;
