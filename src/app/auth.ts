import NextAuth, { DefaultSession, Session } from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import { isTruthy } from '../common/boolish';
import { FirebaseUserInfo } from '../common/users';
import {
  Firecall,
  FIRECALL_COLLECTION_ID,
  USER_COLLECTION_ID,
} from '../components/firebase/firestore';
import { firestore, firebaseAuth } from '../server/firebase/admin';
import { ApiException } from './api/errors';
import { uniqueArray } from '../common/arrayUtils';

export async function checkFirebaseToken(token: string) {
  // logic to salt and hash password
  const decodedToken = await firebaseAuth.verifyIdToken(token);

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

    console.info(`user authorization check: ${userDoc.data()?.authorized}`);
    if (!(userDoc.exists && isTruthy(userDoc.data()?.authorized))) {
      throw new ApiException('your user is not authorized', {
        status: 403,
      });
    }
  }
  console.info(`user verified`);
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
      firecall?: string;
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
    redirect: async ({ url, baseUrl }) => {
      console.info(`redirect ${baseUrl} ${url}`);
      // return '';
      // Allows relative callback URLs
      if (url.startsWith('/')) return `${baseUrl}${url}`;
      // Allows callback URLs on the same origin
      if (new URL(url).origin === baseUrl) return url;
      return baseUrl;
    },
    // authorized: async (params) => {
    //   console.info(`authorized with params: ${JSON.stringify(params)}`);
    //   return true;
    // },
    // signIn: async (params) => {
    //   console.info(`sign in with params: ${JSON.stringify(params)}`);
    //   return true;
    // },
    session: async ({ session, token, user }) => {
      // Guard against undefined token (can happen on initial load)
      if (!token?.id) {
        return session;
      }

      session.user.id = token.id as string;

      try {
        const userInfo = await firestore
          .collection(USER_COLLECTION_ID)
          .doc(session.user.id)
          .get();
        if (userInfo.exists) {
          const userData = userInfo.data() as FirebaseUserInfo;
          session.user.isAuthorized = !!userData.authorized;
          session.user.isAdmin = !!userData.isAdmin;
          session.user.groups = uniqueArray([
            'allUsers',
            ...(userData.groups || []),
          ]);
          session.user.firecall = userData.firecall;
        }
      } catch (err) {
        console.error(`session callback: failed to fetch user data`, err);
        // Return session without user data rather than crashing
      }

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

export async function userAuthorized(session: Session, firecallId: string) {
  const firecall = await firestore
    .collection(FIRECALL_COLLECTION_ID)
    .doc(firecallId)
    .get();
  if (!firecall.exists) {
    throw new Error(`firecall ${firecallId} does not exist`);
  }
  const firecallData = firecall.data() as Firecall;
  if (!firecallData || !firecallData.group) {
    throw new Error(`firecall ${firecallId} has no data`);
  }

  if (
    session.user.groups.indexOf(firecallData.group) < 0 &&
    session.user.firecall !== firecallId
  ) {
    throw new Error(
      `user ${session.user.id} is not in group ${firecallData.group}`
    );
  }
  return firecallData;
}

export async function actionUserAuthorizedForFirecall(firecallId: string) {
  const session = await actionUserRequired();
  return userAuthorized(session, firecallId);
}
