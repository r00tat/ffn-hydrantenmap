import 'server-only';

import { USER_SETTINGS_COLLECTION_ID } from '../../components/firebase/firestore';
import {
  DEFAULT_LOCALE,
  Locale,
  isLocale,
} from '../../i18n/config';
import { firestore } from '../firebase/admin';

interface StoredUserSettings {
  language?: string;
}

/**
 * Read the persisted UI language for a user from Firestore. Returns
 * DEFAULT_LOCALE when no document or no valid value is stored.
 *
 * Kept in a dedicated module (no `auth.ts` imports) so it can be called
 * from the NextAuth session callback without creating an import cycle.
 */
export async function fetchUserLanguage(uid: string): Promise<Locale> {
  try {
    const snap = await firestore
      .collection(USER_SETTINGS_COLLECTION_ID)
      .doc(uid)
      .get();
    if (!snap.exists) return DEFAULT_LOCALE;
    const data = snap.data() as StoredUserSettings;
    if (isLocale(data.language)) {
      return data.language;
    }
  } catch (err) {
    console.warn('fetchUserLanguage failed:', err);
  }
  return DEFAULT_LOCALE;
}
