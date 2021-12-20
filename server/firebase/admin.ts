import * as admin from 'firebase-admin';

// let serviceAccount: process.env.GOOGLE_APPLICATION_CREDENTIALS;

admin.initializeApp({
  // credential: admin.credential.cert(serviceAccount),
});

export default admin;
