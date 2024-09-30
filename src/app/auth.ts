import NextAuth, { DefaultSession } from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import { isTruthy } from '../common/boolish';
import { FirebaseUserInfo } from '../common/users';
import { USER_COLLECTION_ID } from '../components/firebase/firestore';
import firebaseAdmin, { firestore } from '../server/firebase/admin';
import { ApiException } from './api/errors';

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
      .collection(USER_COLLECTION_ID)
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

declare module 'next-auth' {
  /**
   * Returned by `auth`, `useSession`, `getSession` and received as a prop on the `SessionProvider` React Context
   */
  interface Session {
    user: {
      /**
       * the users firebase id
       */
      id: string;
      isAuthorized: boolean;
      isAdmin: boolean;
      groups: string[];
      /**
       * By default, TypeScript merges new interface properties and overwrites existing ones.
       * In this case, the default session user properties will be overwritten,
       * with the new ones defined above. To keep the default session user properties,
       * you need to add them back into the newly declared interface.
       */
    } & DefaultSession['user'];
  }
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
          id: tokenInfo.sub,
          image: tokenInfo.picture,
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
  callbacks: {
    // redirect: async ({ url, baseUrl }) => {
    //   console.info(`redirect ${baseUrl} ${url}`);
    //   // return '';
    //   // Allows relative callback URLs
    //   if (url.startsWith('/')) return `${baseUrl}${url}`;
    //   // Allows callback URLs on the same origin
    //   if (new URL(url).origin === baseUrl) return url;
    //   return baseUrl;
    // },
    // authorized: async (params) => {
    //   console.info(`authorized with params: ${JSON.stringify(params)}`);
    //   return true;
    // },
    // signIn: async (params) => {
    //   console.info(`sign in with params: ${JSON.stringify(params)}`);
    //   return true;
    // },
    session: async ({ session, token, user }) => {
      session.user.id = token.id as string;

      if (session.user.id) {
        const userInfo = await firestore
          .collection(USER_COLLECTION_ID)
          .doc(session.user.id)
          .get();
        // console.info(`firebase user info: ${JSON.stringify(userInfo.data())}`);
        if (userInfo.exists) {
          const userData = userInfo.data() as FirebaseUserInfo;
          session.user.isAuthorized = !!userData.authorized;
          session.user.isAdmin = !!userData.isAdmin;
          session.user.groups = ['allUsers', ...(userData.groups || [])];
        }
      }
      console.info(
        `session with params: ${JSON.stringify(session)} ${JSON.stringify(
          user
        )}`
      );

      return session;
    },
    jwt: ({ token, user }) => {
      if (user) {
        // User is available during sign-in
        token.id = user.id;
      }
      return token;
    },
  },
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

  if (!session.user?.id) {
    throw new ApiException('User not authorized, no id set', { status: 403 });
  }
  // const userDoc = await firestore
  //   .collection(USER_COLLECTION_ID)
  //   .doc(session.user?.id)
  //   .get();
  if (!session.user.isAdmin) {
    throw new ApiException('Admin required, not authorized', { status: 403 });
  }

  return session;
}
