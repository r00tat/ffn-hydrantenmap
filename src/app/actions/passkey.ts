'use server';
import 'server-only';

import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
  type AuthenticationResponseJSON,
  type RegistrationResponseJSON,
} from '@simplewebauthn/server';
import {
  isoBase64URL,
  isoUint8Array,
} from '@simplewebauthn/server/helpers';
import { headers } from 'next/headers';
import {
  MAX_PASSKEY_LABEL_LENGTH,
  Passkey,
  PasskeyInfo,
  toPasskeyInfo,
} from '../../common/passkey';
import { USER_COLLECTION_ID } from '../../components/firebase/firestore';
import { requestOrigin, rpIdFromOrigin } from '../../server/auth/baseUrl';
import {
  createPasskey,
  deletePasskeyDoc,
  getPasskey,
  listPasskeysForUser,
  updatePasskeyLabel,
  updatePasskeyUsage,
} from '../../server/auth/passkeyStore';
import { firebaseAuth, firestore } from '../../server/firebase/admin';
import { actionUserRequired } from '../auth';
import { createJwt, verifyJwt } from './jwt';

const RP_NAME = 'FFN Einsatzkarte';
const CHALLENGE_TTL = '5m';

type ChallengeType = 'webauthn-reg' | 'webauthn-auth';

interface ChallengeClaims {
  typ: ChallengeType;
  challenge: string;
  rpId: string;
  origin: string;
  uid?: string;
}

function normalizeLabel(label: string | undefined): string | undefined {
  return label?.trim().slice(0, MAX_PASSKEY_LABEL_LENGTH) || undefined;
}

/**
 * Origin und RP ID des aktuellen Requests. Ohne eine Origin von der Allowlist
 * darf keine Ceremony starten — RP ID und Origin bestimmen, für welche Domain
 * ein Passkey gilt, und dürfen deshalb nicht vom Client kommen.
 */
async function ceremonyContext() {
  const origin = await requestOrigin();
  if (!origin) {
    throw new Error('passkey: request origin is not allowed');
  }
  return { origin, rpId: rpIdFromOrigin(origin) };
}

async function issueChallengeToken(claims: ChallengeClaims): Promise<string> {
  return createJwt({ ...claims }, claims.uid ?? 'webauthn', CHALLENGE_TTL);
}

/**
 * Die Challenge wird als kurzlebiges, signiertes JWT gehalten statt in einem
 * Firestore-Dokument: `startPasskeyAuthentication` ist unauthentifiziert
 * erreichbar und würde sonst bei jedem Aufruf einen Write auslösen. Das JWT
 * bindet Challenge, `rpId` und `origin` aneinander, der Client kann keinen
 * dieser Werte verändern.
 */
async function readChallengeToken(
  token: string,
  expected: ChallengeType,
): Promise<ChallengeClaims> {
  const payload = await verifyJwt(token);
  if (payload.typ !== expected) {
    throw new Error('passkey: challenge token has the wrong type');
  }
  return payload as unknown as ChallengeClaims;
}

export async function startPasskeyRegistration() {
  const session = await actionUserRequired();
  const { origin, rpId } = await ceremonyContext();
  const uid = session.user.id;

  const existing = await listPasskeysForUser(uid);
  const options = await generateRegistrationOptions({
    rpName: RP_NAME,
    rpID: rpId,
    userID: isoUint8Array.fromUTF8String(uid),
    userName: session.user.email ?? uid,
    userDisplayName: session.user.name ?? session.user.email ?? uid,
    attestationType: 'none',
    // Verhindert, dass derselbe Authenticator für dieselbe Domain ein zweites
    // Mal registriert wird. Passkeys anderer Domains sind hier irrelevant.
    excludeCredentials: existing
      .filter((passkey) => passkey.rpId === rpId)
      .map((passkey) => ({ id: passkey.id, transports: passkey.transports })),
    authenticatorSelection: {
      // residentKey: der Login soll ohne E-Mail-Eingabe funktionieren.
      residentKey: 'required',
      userVerification: 'required',
    },
  });

  return {
    options,
    challengeToken: await issueChallengeToken({
      typ: 'webauthn-reg',
      challenge: options.challenge,
      rpId,
      origin,
      uid,
    }),
  };
}

export async function finishPasskeyRegistration(
  challengeToken: string,
  response: RegistrationResponseJSON,
  label?: string,
): Promise<{ passkey: PasskeyInfo }> {
  const session = await actionUserRequired();
  const uid = session.user.id;

  const claims = await readChallengeToken(challengeToken, 'webauthn-reg');
  if (claims.uid !== uid) {
    throw new Error('passkey: challenge belongs to a different user');
  }

  const verification = await verifyRegistrationResponse({
    response,
    expectedChallenge: claims.challenge,
    expectedOrigin: claims.origin,
    expectedRPID: claims.rpId,
    requireUserVerification: true,
  });
  if (!verification.verified) {
    throw new Error('passkey: registration could not be verified');
  }

  const {
    credential,
    credentialDeviceType,
    credentialBackedUp,
    aaguid,
    origin,
    rpID,
  } = verification.registrationInfo;

  const headerList = await headers();
  const passkey: Passkey = {
    id: credential.id,
    uid,
    publicKey: isoBase64URL.fromBuffer(credential.publicKey),
    counter: credential.counter,
    transports: credential.transports ?? [],
    deviceType: credentialDeviceType,
    backedUp: credentialBackedUp,
    // Aus dem verifizierten clientDataJSON — die vom Browser bezeugte Domain,
    // nicht die vom Client behauptete.
    rpId: rpID ?? claims.rpId,
    origin,
    aaguid,
    label:
      normalizeLabel(label) ??
      `Passkey ${new Date().toISOString().slice(0, 10)}`,
    userAgent: headerList.get('user-agent') ?? '',
    createdAt: new Date().toISOString(),
  };

  await createPasskey(passkey);
  return { passkey: toPasskeyInfo(passkey) };
}

export async function startPasskeyAuthentication() {
  const { origin, rpId } = await ceremonyContext();

  const options = await generateAuthenticationOptions({
    rpID: rpId,
    // Leer, weil Discoverable Credentials verwendet werden: der Browser bietet
    // dem Nutzer die passenden Passkeys selbst an. Nebeneffekt — der
    // unauthentifizierte Endpunkt verrät nicht, welche Credentials existieren.
    allowCredentials: [],
    userVerification: 'required',
  });

  return {
    options,
    challengeToken: await issueChallengeToken({
      typ: 'webauthn-auth',
      challenge: options.challenge,
      rpId,
      origin,
    }),
  };
}

export async function finishPasskeyAuthentication(
  challengeToken: string,
  response: AuthenticationResponseJSON,
): Promise<{ token: string }> {
  const claims = await readChallengeToken(challengeToken, 'webauthn-auth');

  const passkey = await getPasskey(response.id);
  if (!passkey) {
    throw new Error('passkey: unknown credential');
  }

  // Domain-Bindung serverseitig durchsetzen: ein auf der Dev-Domain
  // registrierter Passkey darf in der Produktion nicht greifen — der Browser
  // erzwingt das zwar auch, aber die Prüfung darf nicht allein dort liegen.
  if (passkey.rpId !== claims.rpId) {
    throw new Error('passkey: credential belongs to a different domain');
  }

  // Replay-Schutz: jede Challenge zählt genau einmal.
  if (passkey.lastChallenge && passkey.lastChallenge === claims.challenge) {
    throw new Error('passkey: challenge has already been used');
  }

  const userHandle = response.response.userHandle;
  if (userHandle && isoBase64URL.toUTF8String(userHandle) !== passkey.uid) {
    throw new Error('passkey: user handle does not match the credential');
  }

  const verification = await verifyAuthenticationResponse({
    response,
    expectedChallenge: claims.challenge,
    expectedOrigin: claims.origin,
    expectedRPID: claims.rpId,
    credential: {
      id: passkey.id,
      publicKey: isoBase64URL.toBuffer(passkey.publicKey),
      counter: passkey.counter,
      transports: passkey.transports,
    },
    requireUserVerification: true,
  });
  if (!verification.verified) {
    throw new Error('passkey: authentication could not be verified');
  }

  const { newCounter } = verification.authenticationInfo;
  // Viele Passkeys (iCloud-Schlüsselbund, Google Password Manager) führen
  // keinen Counter und melden konstant 0 — nur prüfen, wenn einer geführt wird.
  if (passkey.counter > 0 && newCounter <= passkey.counter) {
    throw new Error('passkey: signature counter did not increase');
  }

  // Die Berechtigungen kommen ausschließlich aus dem Benutzerdokument, nie aus
  // dem Request: ein gesperrter Benutzer kommt auch mit einem technisch
  // gültigen Passkey nicht herein. Gleiches Vorgehen wie in
  // exchangeCustomJwtForFirebaseToken.
  const userDoc = await firestore
    .collection(USER_COLLECTION_ID)
    .doc(passkey.uid)
    .get();
  if (!userDoc.exists) {
    throw new Error(`passkey: no user document for ${passkey.uid}`);
  }
  const userData = userDoc.data() as {
    authorized?: boolean;
    isAdmin?: boolean;
    groups?: string[];
  };
  if (!userData.authorized) {
    throw new Error(`passkey: user ${passkey.uid} is not authorized`);
  }

  await updatePasskeyUsage(passkey.id, newCounter, claims.challenge);

  const token = await firebaseAuth.createCustomToken(passkey.uid, {
    groups: userData.groups || ['allUsers'],
    isAdmin: !!userData.isAdmin,
    authorized: true,
  });

  console.info(`passkey login for ${passkey.uid} on ${passkey.rpId}`);
  return { token };
}

export async function listPasskeys(): Promise<PasskeyInfo[]> {
  const session = await actionUserRequired();
  const passkeys = await listPasskeysForUser(session.user.id);
  return passkeys
    .map(toPasskeyInfo)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/**
 * Lädt den Passkey und stellt sicher, dass er dem angemeldeten Benutzer gehört.
 * Für fremde Credentials dieselbe Fehlermeldung wie für nicht existierende —
 * sonst ließe sich über die Verwaltung prüfen, welche IDs vergeben sind.
 */
async function ownedPasskey(id: string): Promise<Passkey> {
  const session = await actionUserRequired();
  const passkey = await getPasskey(id);
  if (!passkey || passkey.uid !== session.user.id) {
    throw new Error('passkey: not found');
  }
  return passkey;
}

export async function renamePasskey(id: string, label: string): Promise<void> {
  await ownedPasskey(id);
  const normalized = normalizeLabel(label);
  if (!normalized) {
    throw new Error('passkey: label must not be empty');
  }
  await updatePasskeyLabel(id, normalized);
}

export async function deletePasskey(id: string): Promise<void> {
  await ownedPasskey(id);
  await deletePasskeyDoc(id);
}
