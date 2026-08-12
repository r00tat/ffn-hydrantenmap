'use server';
import 'server-only';

import crypto from 'crypto';
import { CreateRequest } from 'firebase-admin/auth';
import { v4 as uuidv4 } from 'uuid';
import {
  guestDisplayName,
  guestNameFromDisplayName,
} from '../../common/firecallGuest';
import {
  clampExpiry,
  shareLinkStatus,
  type FirecallShareLink,
} from '../../common/firecallShareLink';
import { FirebaseUserInfo } from '../../common/users';
import { USER_COLLECTION_ID } from '../../components/firebase/firestore';
import { getBaseUrl } from '../../server/auth/baseUrl';
import { userSessionCache } from '../../server/auth/userSessionCache';
import { firebaseAuth, firestore } from '../../server/firebase/admin';
import { setCustomClaimsForUser } from '../api/users/[uid]/updateUser';
import { actionUserAuthorizedForFirecall, actionUserRequired } from '../auth';
import { createJwt } from './jwt';

/** Ein Gastdokument, wie es in `user` liegt. */
type GuestUserData = FirebaseUserInfo & {
  displayName?: string;
  email?: string;
};

export interface CreateFirecallShareLinkOptions {
  /** Anzeigename des Gasts, im Share-Dialog Pflichtfeld. */
  name: string;
  /** `true` = Lesen und Schreiben, `false` = nur Lesen. */
  canWrite: boolean;
  /** Ablaufzeitpunkt in Millisekunden; wird auf höchstens ein Jahr gekappt. */
  expiresAt: number;
}

export interface UpdateFirecallShareLinkOptions {
  name?: string;
  canWrite?: boolean;
  expiresAt?: number;
  /** `false` deaktiviert den Zugang, `true` reaktiviert ihn. */
  active?: boolean;
}

/**
 * Alle Verwaltungsoperationen verlangen Gruppenzugriff auf den Einsatz — ein
 * Einsatz-Gast darf weder sehen, wer sonst Zugang hat, noch weitere Zugänge
 * erzeugen. Sonst könnte ein einmal weitergegebener Link beliebig viele
 * weitere nach sich ziehen.
 */
async function requireManager(firecallId: string) {
  if (!firecallId) {
    throw new Error('firecall parameter is missing');
  }
  return actionUserAuthorizedForFirecall(firecallId, {
    requireWrite: true,
    requireGroupMember: true,
  });
}

/** Lädt das Gastdokument und stellt sicher, dass es zu diesem Einsatz gehört. */
async function loadGuest(firecallId: string, uid: string) {
  const ref = firestore.collection(USER_COLLECTION_ID).doc(uid);
  const doc = await ref.get();
  const data = doc.data() as GuestUserData | undefined;
  if (!doc.exists || !data || data.firecall !== firecallId) {
    throw new Error(`${uid} is not a share link of firecall ${firecallId}`);
  }
  return { ref, data };
}

function toShareLink(
  uid: string,
  data: GuestUserData,
  lastSignInAt?: number
): FirecallShareLink {
  return {
    uid,
    name: guestNameFromDisplayName(data.displayName),
    canWrite: data.firecallWrite !== false,
    expiresAt: data.firecallExpiresAt,
    createdAt: data.firecallCreatedAt,
    createdByName: data.firecallCreatedByName,
    lastSignInAt,
    disabled: !data.authorized,
  };
}

/**
 * `${origin}/einsatz/<id>?token=<jwt>` — serverseitig gebaut, weil
 * `window.location.origin` in der Capacitor-App `https://localhost` ist und ein
 * dort erzeugter Link damit für alle anderen unbrauchbar wäre.
 */
async function shareLinkUrl(firecallId: string, token: string) {
  return `${await getBaseUrl()}/einsatz/${firecallId}?token=${token}`;
}

/** JWT für einen Gast. `exp` entspricht exakt dem Ablauf des Zugangs. */
async function signGuestJwt(
  uid: string,
  data: GuestUserData,
  expiresAt: number
) {
  return createJwt({ ...data, uid }, uid, Math.floor(expiresAt / 1000));
}

export async function listFirecallShareLinks(
  firecallId: string
): Promise<FirecallShareLink[]> {
  await requireManager(firecallId);

  const snapshot = await firestore
    .collection(USER_COLLECTION_ID)
    .where('firecall', '==', firecallId)
    .get();

  const docs = snapshot.docs;
  if (docs.length === 0) {
    return [];
  }

  // `lastSignInTime` steht nur in Firebase Auth. Ein Batch-Lookup statt eines
  // Aufrufs je Gast; ein fehlender Auth-Record (händisch gelöscht) ist kein
  // Fehler, der Eintrag bleibt dann ohne „zuletzt genutzt" stehen.
  const { users } = await firebaseAuth.getUsers(
    docs.map((doc) => ({ uid: doc.id }))
  );
  const lastSignIn = new Map(
    users.map((user) => [
      user.uid,
      user.metadata?.lastSignInTime
        ? new Date(user.metadata.lastSignInTime).getTime()
        : undefined,
    ])
  );

  return docs
    .map((doc) =>
      toShareLink(doc.id, doc.data() as GuestUserData, lastSignIn.get(doc.id))
    )
    .sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));
}

export async function createFirecallShareLink(
  firecallId: string,
  options: CreateFirecallShareLinkOptions
) {
  const firecall = await requireManager(firecallId);
  const session = await actionUserRequired();
  const now = Date.now();

  const displayName = guestDisplayName(options?.name, firecall.name);
  const canWrite = !!options?.canWrite;
  const expiresAt = clampExpiry(options.expiresAt, now);
  const digest = crypto.hash('sha256', uuidv4()).substring(0, 8);

  // 1. Anonymen Benutzer anlegen
  const userBaseData: CreateRequest = {
    displayName,
    email: `firecall+${firecallId}-${digest}@ff-neusiedlamsee.at`,
    emailVerified: true,
  };
  const { uid } = await firebaseAuth.createUser(userBaseData);

  // 2. Benutzerdokument und Claims — das Dokument ist die Quelle der Wahrheit,
  // damit ein verteilter Link jederzeit stillgelegt werden kann.
  const userData = {
    ...userBaseData,
    authorized: true,
    groups: ['allUsers'],
    isAdmin: false,
    firecall: firecallId,
    firecallWrite: canWrite,
    firecallExpiresAt: expiresAt,
    firecallCreatedAt: now,
    firecallCreatedBy: session.user.id,
    firecallCreatedByName: session.user.name ?? '',
  };
  await firestore.collection(USER_COLLECTION_ID).doc(uid).set(userData);

  await setCustomClaimsForUser(uid, {
    groups: ['allUsers'],
    isAdmin: false,
    authorized: true,
    firecall: firecallId,
    firecallWrite: canWrite,
    firecallExpires: expiresAt,
  });

  // 3. JWT, das genau mit dem Zugang abläuft
  const token = await signGuestJwt(uid, userData, expiresAt);
  return { uid, link: await shareLinkUrl(firecallId, token) };
}

export async function updateFirecallShareLink(
  firecallId: string,
  uid: string,
  options: UpdateFirecallShareLinkOptions
): Promise<FirecallShareLink> {
  const firecall = await requireManager(firecallId);
  const { ref, data } = await loadGuest(firecallId, uid);
  const now = Date.now();

  const expiresAt =
    options.expiresAt !== undefined
      ? clampExpiry(options.expiresAt, now)
      : data.firecallExpiresAt;

  // Reaktivieren nützt nichts, solange das Datum in der Vergangenheit liegt —
  // der Zugang bliebe trotz „aktiv" tot. Lieber ein klarer Fehler.
  if (options.active === true && (!expiresAt || expiresAt <= now)) {
    throw new Error(
      `cannot activate expired share link ${uid} without a new expiry`
    );
  }

  const canWrite = options.canWrite ?? data.firecallWrite !== false;
  const authorized = options.active ?? !!data.authorized;
  const displayName =
    options.name !== undefined
      ? guestDisplayName(options.name, firecall.name)
      : data.displayName;

  await ref.set(
    {
      ...(displayName ? { displayName } : {}),
      authorized,
      firecallWrite: canWrite,
      ...(expiresAt ? { firecallExpiresAt: expiresAt } : {}),
    },
    { merge: true }
  );

  if (options.name !== undefined && displayName) {
    await firebaseAuth.updateUser(uid, { displayName });
  }

  await setCustomClaimsForUser(uid, {
    groups: data.groups || ['allUsers'],
    isAdmin: false,
    authorized,
    firecall: firecallId,
    firecallWrite: canWrite,
    firecallExpires: expiresAt,
  });

  // Ohne Invalidierung bliebe die Änderung bis zum Ablauf des Session-Caches
  // wirkungslos.
  userSessionCache.invalidate(uid);

  return toShareLink(uid, {
    ...data,
    displayName,
    authorized,
    firecallWrite: canWrite,
    firecallExpiresAt: expiresAt,
  });
}

/**
 * Stellt den Link eines bestehenden Zugangs erneut aus. Bewusst frisch
 * signiert statt gespeichert: das JWT ist das gesamte Geheimnis des Zugangs und
 * hat in Firestore nichts verloren. Alter und neuer Link sind gleichwertig und
 * laufen zum selben Zeitpunkt ab.
 */
export async function issueFirecallShareLinkUrl(
  firecallId: string,
  uid: string
) {
  await requireManager(firecallId);
  const { data } = await loadGuest(firecallId, uid);

  const status = shareLinkStatus(
    { expiresAt: data.firecallExpiresAt, disabled: !data.authorized },
    Date.now()
  );
  if (status !== 'active') {
    throw new Error(`share link ${uid} is ${status}`);
  }

  const token = await signGuestJwt(uid, data, data.firecallExpiresAt!);
  return { link: await shareLinkUrl(firecallId, token) };
}
