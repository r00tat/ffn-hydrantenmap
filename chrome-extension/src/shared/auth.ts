import {
  GoogleAuthProvider,
  signInWithCredential,
  onAuthStateChanged,
  signOut as firebaseSignOut,
  User,
} from 'firebase/auth';
import { auth } from './firebase';

/**
 * Sign in using chrome.identity to get a Google OAuth token,
 * then exchange it for a Firebase credential.
 */
export async function signInWithGoogle(): Promise<User> {
  return new Promise((resolve, reject) => {
    chrome.identity.getAuthToken({ interactive: true }, async (token) => {
      if (chrome.runtime.lastError || !token) {
        reject(new Error(chrome.runtime.lastError?.message || 'No token'));
        return;
      }
      try {
        const credential = GoogleAuthProvider.credential(null, token);
        const result = await signInWithCredential(auth, credential);
        // Notify service worker of login
        chrome.runtime.sendMessage({ type: 'AUTH_STATE_CHANGED' }).catch(() => {});
        resolve(result.user);
      } catch (err) {
        // If token is stale, remove and retry once
        chrome.identity.removeCachedAuthToken({ token }, () => {
          reject(err);
        });
      }
    });
  });
}

export async function signOut(): Promise<void> {
  return new Promise((resolve) => {
    chrome.identity.getAuthToken({ interactive: false }, (token) => {
      if (token) {
        chrome.identity.removeCachedAuthToken({ token }, async () => {
          await firebaseSignOut(auth);
          chrome.runtime.sendMessage({ type: 'AUTH_STATE_CHANGED' }).catch(() => {});
          resolve();
        });
      } else {
        firebaseSignOut(auth).then(() => {
          chrome.runtime.sendMessage({ type: 'AUTH_STATE_CHANGED' }).catch(() => {});
          resolve();
        });
      }
    });
  });
}

export function onAuthChange(callback: (user: User | null) => void) {
  return onAuthStateChanged(auth, callback);
}
