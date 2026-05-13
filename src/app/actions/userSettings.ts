'use server';
import 'server-only';

import { getTranslations } from 'next-intl/server';
import { revalidatePath } from 'next/cache';
import { cookies } from 'next/headers';
import { USER_SETTINGS_COLLECTION_ID } from '../../components/firebase/firestore';
import {
  Locale,
  LOCALE_COOKIE_NAME,
  isLocale,
} from '../../i18n/config';
import { firestore } from '../../server/firebase/admin';
import { ApiException } from '../api/errors';
import { actionUserRequired } from '../auth';

export interface UserSettingsDoc {
  language?: Locale;
  updatedAt?: string;
}

/**
 * Read the calling user's settings document. Returns an empty object when
 * the document does not exist yet (first sign-in).
 */
export async function getMyUserSettings(): Promise<UserSettingsDoc> {
  const session = await actionUserRequired();
  const snap = await firestore
    .collection(USER_SETTINGS_COLLECTION_ID)
    .doc(session.user.id)
    .get();
  if (!snap.exists) {
    return {};
  }
  return snap.data() as UserSettingsDoc;
}

/**
 * Persist the calling user's preferred UI language. Updates Firestore,
 * sets the NEXT_LOCALE cookie, and revalidates the layout so the new
 * locale is picked up on the next render.
 */
export async function updateMyLanguage(language: string): Promise<{
  language: Locale;
}> {
  const session = await actionUserRequired();

  if (!isLocale(language)) {
    const t = await getTranslations('auth');
    throw new ApiException(t('invalidLanguage'), { status: 400 });
  }

  await firestore
    .collection(USER_SETTINGS_COLLECTION_ID)
    .doc(session.user.id)
    .set(
      {
        language,
        updatedAt: new Date().toISOString(),
      },
      { merge: true },
    );

  // Mirror to the NEXT_LOCALE cookie so subsequent requests (including
  // the immediate revalidation below) pick up the new language even
  // before the next NextAuth session refresh.
  const cookieStore = await cookies();
  cookieStore.set(LOCALE_COOKIE_NAME, language, {
    path: '/',
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 365,
  });

  revalidatePath('/', 'layout');

  return { language };
}

