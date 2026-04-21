import {
  Auth,
  GoogleAuthProvider,
  signInWithCredential,
  signInWithPopup,
  UserCredential,
} from 'firebase/auth';

const googleProvider = new GoogleAuthProvider();

export async function isCapacitorNative(): Promise<boolean> {
  try {
    const coreName = '@capacitor/core';
    const { Capacitor } = await import(
      /* @vite-ignore */ /* webpackIgnore: true */ coreName
    );
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
}

export async function signInWithGoogle(auth: Auth): Promise<UserCredential> {
  if (await isCapacitorNative()) {
    const pluginName = '@capacitor-firebase/authentication';
    const { FirebaseAuthentication } = await import(
      /* @vite-ignore */ /* webpackIgnore: true */ pluginName
    );
    const result = await FirebaseAuthentication.signInWithGoogle();
    const idToken = result?.credential?.idToken;
    if (!idToken) {
      throw new Error('Kein ID-Token vom nativen Google-Sign-In erhalten');
    }
    return signInWithCredential(
      auth,
      GoogleAuthProvider.credential(idToken, result.credential?.accessToken)
    );
  }
  return signInWithPopup(auth, googleProvider);
}
