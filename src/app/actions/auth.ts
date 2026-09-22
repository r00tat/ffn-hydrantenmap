'use server';
import 'server-only';

import { firebaseAuth } from '../../server/firebase/admin';
import { mintFirebaseCustomToken } from '../../server/auth/mintCustomToken';
import { actionUserRequired } from '../auth';
import { verifyJwt } from './jwt';

/**
 * Tauscht das JWT aus einem Share-Link gegen ein Firebase Custom Token.
 *
 * Die Berechtigungen kommen dabei aus dem **Benutzerdokument**, nicht aus dem
 * JWT-Payload: Das JWT belegt nur, *wer* der Gast ist. Damit lässt sich einem
 * bereits verteilten Link das Schreibrecht nachträglich entziehen oder der
 * Zugang ganz sperren.
 */
export async function exchangeCustomJwtForFirebaseToken(customToken: string) {
  try {
    const payload = await verifyJwt(customToken);

    if (!payload.sub) {
      throw new Error('Invalid token: subject missing');
    }

    const uid = payload.sub;

    // Claims und Ablaufpruefung liegen in `mintFirebaseCustomToken`, damit
    // dieser Weg und die Wiederanmeldung aus der Session dieselben Rechte
    // praegen. Ein anderer Fehler als der Ablauf bleibt nach aussen
    // "Invalid token" — der Aufrufer soll nicht erfahren, ob es den Benutzer
    // gibt und woran es lag.
    const minted = await mintFirebaseCustomToken(uid);
    if (!minted.token) {
      if (minted.error === 'Token expired') {
        console.info(`share link for ${uid} is no longer valid`);
        return { error: 'Token expired' };
      }
      throw new Error(minted.error);
    }

    return { token: minted.token };
  } catch (error: any) {
    console.error('Error exchanging custom token:', error);
    if (error.code === 'ERR_JWT_EXPIRED') {
      return { error: 'Token expired' };
    }
    return { error: 'Invalid token', details: error.message };
  }
}

/**
 * Stellt die Firebase-Anmeldung aus einer bestehenden NextAuth-Session wieder
 * her.
 *
 * Die App fuehrt zwei Sitzungen: das NextAuth-Cookie und den Firebase-Client.
 * Faellt nur der Firebase-Client aus — abgebrochener Login, verlorener
 * Browserspeicher, geschlossene WebView — bleibt das Cookie gueltig, und die
 * App zeigt sich angemeldet, waehrend jeder Firestore-Zugriff ohne
 * `request.auth` laeuft und leer bleibt. Aus diesem Zustand gab es bisher
 * keinen Rueckweg: Der einzige Custom-Token-Login hing am `?token=` eines
 * Share-Links.
 *
 * Neue Rechte entstehen hier nicht. Das Cookie ist selbst aus einem
 * verifizierten Firebase-ID-Token entstanden, und die Claims kommen wie
 * ueberall aus dem Benutzerdokument.
 */
export async function createFirebaseTokenForSession() {
  const session = await actionUserRequired();
  const uid = session.user?.id;
  if (!uid) {
    return { error: 'no user id in session' };
  }
  const minted = await mintFirebaseCustomToken(uid);
  if (!minted.token) {
    console.warn(`session re-login for ${uid} refused: ${minted.error}`);
    return { error: minted.error ?? 'no token' };
  }
  console.info(`minted session re-login token for ${uid}`);
  return { token: minted.token };
}

/**
 * Tauscht das ID-Token der **nativen** Firebase-Sitzung gegen ein Custom
 * Token fuer den Client in der WebView.
 *
 * Unter Android laufen zwei Firebase-Clients nebeneinander: das native SDK,
 * das `googleAuthAdapter` mit `skipNativeAuth: false` anmeldet, und das
 * JS-SDK in der WebView mit eigener Persistenz. Nur das native SDK haelt
 * seine Anmeldung zuverlaessig — ein logcat des betroffenen Geraets zeigt
 * den Benutzer 270 ms nach jedem Prozessstart wieder, offline aus der
 * lokalen Persistenz, waehrend die WebView ohne Benutzer hochkommt. Bisher
 * hat niemand nach dieser Sitzung gefragt, und der Benutzer musste sich
 * neu anmelden, obwohl eine gueltige Anmeldung zwei Zentimeter daneben lag.
 *
 * Bewusst **ohne** Waechter aus `src/app/auth.ts`: Das ID-Token ist hier das
 * Anmeldemittel, nicht das Ergebnis einer bestehenden Anmeldung — derselbe
 * Weg, den auch der NextAuth-Credentials-Provider geht. `verifyIdToken`
 * prueft Signatur, Projekt und Ablauf, und `checkRevoked` sorgt dafuer, dass
 * ein abgemeldetes oder gesperrtes Konto seine alte native Sitzung nicht
 * weitertraegt. Rechte entstehen dabei keine: die Claims kommen wie ueberall
 * aus dem Benutzerdokument.
 */
export async function exchangeNativeIdTokenForFirebaseToken(idToken: string) {
  if (!idToken) {
    return { error: 'Invalid token' };
  }
  try {
    const decoded = await firebaseAuth.verifyIdToken(idToken, true);
    const minted = await mintFirebaseCustomToken(decoded.uid);
    if (!minted.token) {
      console.warn(
        `native re-login for ${decoded.uid} refused: ${minted.error}`,
      );
      return { error: minted.error ?? 'no token' };
    }
    console.info(`minted native re-login token for ${decoded.uid}`);
    return { token: minted.token };
  } catch (error: any) {
    // Nach aussen bleibt es bei "Invalid token" — der Aufrufer soll nicht
    // erfahren, ob es den Benutzer gibt und woran es lag.
    console.error('native id token exchange failed:', error);
    return { error: 'Invalid token', details: error.message };
  }
}
