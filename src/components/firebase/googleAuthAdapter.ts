import { Capacitor } from '@capacitor/core';
import { FirebaseAuthentication } from '@capacitor-firebase/authentication';
import {
  Auth,
  GoogleAuthProvider,
  signInWithCredential,
  signInWithPopup,
  UserCredential,
} from 'firebase/auth';

const googleProvider = new GoogleAuthProvider();

interface WindowCapacitor {
  Capacitor?: {
    Plugins?: Record<string, unknown>;
    getPlatform?: () => string;
    isNativePlatform?: () => boolean;
    isPluginAvailable?: (name: string) => boolean;
  };
}

function getWindowCapacitor(): WindowCapacitor['Capacitor'] | undefined {
  if (typeof window === 'undefined') return undefined;
  return (window as unknown as WindowCapacitor).Capacitor;
}

export function isCapacitorNative(): boolean {
  const win = getWindowCapacitor();
  if (win?.isNativePlatform?.() === true) return true;
  const winPlatform = win?.getPlatform?.();
  if (winPlatform && winPlatform !== 'web') return true;
  return Capacitor.isNativePlatform();
}

export interface NativeDebugInfo {
  isCapacitorNative: boolean;
  importedIsNativePlatform: boolean;
  importedPlatform: string;
  windowIsNativePlatform: boolean | null;
  windowPlatform: string | null;
  hasCapacitorGlobal: boolean;
  hasAndroidBridge: boolean;
  hasPluginHeaders: boolean;
  pluginHeaderNames: string[];
  availablePlugins: string[];
  hasFirebaseAuthenticationPlugin: boolean;
  firebaseAuthViaIsPluginAvailable: boolean | null;
  locationHref: string;
  locationOrigin: string;
  userAgent: string;
}

export function getNativeDebugInfo(): NativeDebugInfo {
  const win = getWindowCapacitor();
  const w =
    typeof window !== 'undefined'
      ? (window as unknown as {
          androidBridge?: unknown;
          Capacitor?: { PluginHeaders?: Array<{ name: string }> };
        })
      : undefined;
  const pluginHeaders = w?.Capacitor?.PluginHeaders;
  return {
    isCapacitorNative: isCapacitorNative(),
    importedIsNativePlatform: Capacitor.isNativePlatform(),
    importedPlatform: Capacitor.getPlatform(),
    windowIsNativePlatform: win?.isNativePlatform
      ? win.isNativePlatform()
      : null,
    windowPlatform: win?.getPlatform ? win.getPlatform() : null,
    hasCapacitorGlobal: !!win,
    hasAndroidBridge: typeof w?.androidBridge !== 'undefined',
    hasPluginHeaders: Array.isArray(pluginHeaders) && pluginHeaders.length > 0,
    pluginHeaderNames: Array.isArray(pluginHeaders)
      ? pluginHeaders.map((h) => h.name)
      : [],
    availablePlugins: win?.Plugins ? Object.keys(win.Plugins) : [],
    hasFirebaseAuthenticationPlugin: !!win?.Plugins?.FirebaseAuthentication,
    firebaseAuthViaIsPluginAvailable: win?.isPluginAvailable
      ? win.isPluginAvailable('FirebaseAuthentication')
      : null,
    locationHref: typeof location !== 'undefined' ? location.href : '',
    locationOrigin: typeof location !== 'undefined' ? location.origin : '',
    userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : '',
  };
}

export async function signInWithGoogle(auth: Auth): Promise<UserCredential> {
  const info = getNativeDebugInfo();
  console.info('[googleAuthAdapter] signInWithGoogle start', info);
  if (isCapacitorNative()) {
    console.info(
      '[googleAuthAdapter] calling FirebaseAuthentication.signInWithGoogle'
    );
    const result = await FirebaseAuthentication.signInWithGoogle();
    console.info('[googleAuthAdapter] native sign-in result', {
      hasCredential: !!result?.credential,
      hasIdToken: !!result?.credential?.idToken,
      hasAccessToken: !!result?.credential?.accessToken,
      user: result?.user
        ? { uid: result.user.uid, email: result.user.email }
        : null,
    });
    const idToken = result?.credential?.idToken;
    if (!idToken) {
      throw new Error('Kein ID-Token vom nativen Google-Sign-In erhalten');
    }
    return signInWithCredential(
      auth,
      GoogleAuthProvider.credential(idToken, result.credential?.accessToken)
    );
  }
  console.info('[googleAuthAdapter] falling back to signInWithPopup (web)');
  return signInWithPopup(auth, googleProvider);
}
