import NextAuth from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import firebaseAdmin, { firestore } from '../server/firebase/admin';
import { ApiException } from './api/errors';
import { isTruthy } from '../common/boolish';

export async function checkFirebaseToken(token: string) {
  // logic to salt and hash password
  const decodedToken = await firebaseAdmin.auth().verifyIdToken(token);

  if (
    !(
      decodedToken.email &&
      decodedToken.email.indexOf('@ff-neusiedlamsee.at') > 0
    )
  ) {
    // allow all internal users
    // fetch the user and check if this is an active user
    const userDoc = await firestore
      .collection('user')
      .doc(decodedToken.sub)
      .get();

    console.info(
      `user ${userDoc.id} ${userDoc.data()?.email} authorized:${
        userDoc.data()?.authorized
      }`
    );
    if (!(userDoc.exists && isTruthy(userDoc.data()?.authorized))) {
      throw new ApiException('your user is not authorized', {
        status: 403,
      });
    }
  }
  console.info(`user ${decodedToken.email} verified`);
  return decodedToken;
}

export const { handlers, signIn, signOut, auth } = NextAuth({
  providers: [
    Credentials({
      // You can specify which fields should be submitted, by adding keys to the `credentials` object.
      // e.g. domain, username, password, 2FA token, etc.
      credentials: {
        firebaseToken: {},
      },
      authorize: async (credentials: any) => {
        // console.info(`running auth.js authorize`);
        const tokenInfo = await checkFirebaseToken(credentials.firebaseToken);
        // console.info(`token Info: ${JSON.stringify(tokenInfo)}`);
        return {
          // not displayed, using image as workaround
          id: tokenInfo.sub,
          // image: tokenInfo.picture,
          image: tokenInfo.sub,
          email: tokenInfo.email,
          name: tokenInfo.name,
        };
      },
    }),
  ],
  trustHost: true,
  session: {
    maxAge: 60 * 60,
  },
  // adapter: FirestoreAdapter(),
  // callbacks: {
  // redirect: async ({ url, baseUrl }) => {
  //   console.info(`redirect ${baseUrl} ${url}`);
  //   return '/map';
  // },
  //   authorized: async (params) => {
  //     console.info(`authorized with params: ${JSON.stringify(params)}`);
  //     return true;
  //   },
  //   signIn: async (params) => {
  //     console.info(`sign in with params: ${JSON.stringify(params)}`);
  //     return true;
  //   },
  //   session: async ({ session, token, user }) => {
  //     console.info(
  //       `session with params: ${JSON.stringify(session)} ${JSON.stringify(
  //         user
  //       )}`
  //     );
  //     return session;
  //   },
  //   jwt: async ({ token, user, account }) => {
  //     console.info(
  //       `jwt token: ${JSON.stringify(token)}\nuser: ${JSON.stringify(
  //         user
  //       )}\n${JSON.stringify(account)}`
  //     );
  //     return token;
  //   },
  // },
});

export async function actionUserRequired() {
  const session = await auth();
  // console.info(`session info: ${JSON.stringify(session)}`);
  if (!session?.user) {
    throw new ApiException('User not authorized', { status: 403 });
  }
  return session;
}

export async function actionAdminRequired() {
  const session = await actionUserRequired();
  // console.info(`session: ${JSON.stringify(session)}`);

  if (!session.user?.image) {
    throw new ApiException('User not authorized, no id set', { status: 403 });
  }
  const userDoc = await firestore
    .collection('user')
    .doc(session.user?.image)
    .get();
  if (!userDoc.data()?.isAdmin) {
    throw new ApiException('Admin require, not authorized', { status: 403 });
  }

  return session;
}
