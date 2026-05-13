import NextAuth, { DefaultSession, Session } from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import { getTranslations } from 'next-intl/server';
import { isTruthy } from '../common/boolish';
import { isInternalEmail } from '../common/internalDomains';
import {
  Firecall,
  FIRECALL_COLLECTION_ID,
  USER_COLLECTION_ID,
} from '../components/firebase/firestore';
import { isLocale, Locale } from '../i18n/config';
import { firestore, firebaseAuth } from '../server/firebase/admin';
import { fetchUserLanguage } from '../server/userSettings/fetchUserLanguage';
import { ApiException } from './api/errors';
import {
  ensureUserProvisioned,
  getUserSessionData,
} from '../server/auth/autoProvisionUser';

export async function checkFirebaseToken(token: string) {
  const decodedToken = await firebaseAuth.verifyIdToken(token);

  if (!isInternalEmail(decodedToken.email)) {
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
  console.info(`user ${decodedToken.sub} verified`);
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
       * Preferred UI language from `userSettings/{uid}`. Undefined when the
       * user has not configured one yet — callers fall back to cookie /
       * Accept-Language detection.
       */
      language?: Locale;
      /**
       * By default, TypeScript merges new interface properties and overwrites existing ones.
       * In this case, the default session user properties will be overwritten,
       * with the new ones defined above. To keep the default session user properties,
       * you need to add them back into the newly declared interface.
       */
    } & DefaultSession['user'];
  }
}

declare module '@auth/core/jwt' {
  interface JWT {
    id?: string;
    language?: Locale;
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
        const tokenInfo = await checkFirebaseToken(credentials.firebaseToken);

        await ensureUserProvisioned(
          tokenInfo.sub,
          tokenInfo.email,
          tokenInfo.name,
        );

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
      // console.info(`redirect ${baseUrl} ${url}`);
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
        const userData = await getUserSessionData(
          session.user.id,
          session.user.email,
          session.user.name,
        );
        if (userData) {
          session.user.isAuthorized = userData.isAuthorized;
          session.user.isAdmin = userData.isAdmin;
          session.user.groups = userData.groups;
          session.user.firecall = userData.firecall;
        }
      } catch (err) {
        console.error(`session callback: failed to fetch user data`, err);
      }

      if (isLocale(token.language)) {
        session.user.language = token.language;
      }

      return session;
    },
    jwt: async ({ token, user, trigger, session: updatedSession }) => {
      if (user) {
        // User is available during sign-in — load persisted language once
        // and stash it on the JWT so subsequent requests don't hit Firestore.
        token.id = user.id;
        try {
          token.language = await fetchUserLanguage(user.id as string);
        } catch (err) {
          console.error(`jwt callback: failed to fetch user language`, err);
        }
      }

      // Allow the client to push a language update into the JWT via
      // `useSession().update({ language })` after a successful save.
      if (
        trigger === 'update' &&
        updatedSession &&
        typeof updatedSession === 'object' &&
        'language' in updatedSession &&
        isLocale((updatedSession as { language?: string }).language)
      ) {
        token.language = (updatedSession as { language: Locale }).language;
      }

      return token;
    },
  },
});

export async function actionUserRequired() {
  const session = await auth();
  // console.info(`session info: ${JSON.stringify(session)}`);
  if (!session?.user || !session.user.isAuthorized) {
    const t = await getTranslations('auth');
    throw new ApiException(t('userNotAuthorized'), { status: 403 });
  }
  return session;
}

export async function actionAdminRequired() {
  const session = await actionUserRequired();
  // console.info(`session: ${JSON.stringify(session)}`);

  const t = await getTranslations('auth');

  if (!session.user?.id) {
    throw new ApiException(t('userIdMissing'), { status: 403 });
  }
  if (!session.user.isAdmin) {
    throw new ApiException(t('adminRequired'), { status: 403 });
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
      `user ${session.user.id} is not in group ${firecallData.group}`,
    );
  }
  return firecallData;
}

export async function actionUserAuthorizedForFirecall(firecallId: string) {
  const session = await actionUserRequired();
  return userAuthorized(session, firecallId);
}
