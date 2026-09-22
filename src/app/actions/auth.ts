'use server';
import 'server-only';

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
