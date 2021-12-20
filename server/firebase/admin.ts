import * as firebaseAdmin from 'firebase-admin';

// let serviceAccount: process.env.GOOGLE_APPLICATION_CREDENTIALS;

firebaseAdmin.initializeApp({
  // credential: admin.credential.cert(serviceAccount),
});

export default firebaseAdmin;
