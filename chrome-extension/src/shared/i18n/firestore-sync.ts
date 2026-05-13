import { doc, getDoc } from 'firebase/firestore';
import { firestore } from '../firebase';
import { isLocale } from './config';
import { setLocale } from './store';

const USER_SETTINGS_COLLECTION = 'userSettings';

interface UserSettingsDoc {
  language?: string;
}

/**
 * Fetch the signed-in user's preferred UI language from the
 * `userSettings/{uid}` collection (same source as the web app's
 * profile-language switch) and apply it to the extension's locale
 * store. Silent no-op when the user has not configured a preference
 * yet or the document cannot be read.
 */
export async function syncLocaleFromUserSettings(uid: string): Promise<void> {
  try {
    const snap = await getDoc(doc(firestore, USER_SETTINGS_COLLECTION, uid));
    if (!snap.exists()) return;
    const data = snap.data() as UserSettingsDoc;
    if (isLocale(data.language)) {
      await setLocale(data.language);
    }
  } catch (err) {
    console.warn('Failed to sync locale from userSettings:', err);
  }
}
