import 'server-only';
import { Passkey, PASSKEY_COLLECTION_ID } from '../../common/passkey';
import { firestore } from '../firebase/admin';

function passkeyCollection() {
  return firestore.collection(PASSKEY_COLLECTION_ID);
}

function toPasskey(id: string, data: FirebaseFirestore.DocumentData): Passkey {
  return { ...data, id } as Passkey;
}

export async function getPasskey(id: string): Promise<Passkey | undefined> {
  const doc = await passkeyCollection().doc(id).get();
  const data = doc.data();
  return doc.exists && data ? toPasskey(doc.id, data) : undefined;
}

export async function listPasskeysForUser(uid: string): Promise<Passkey[]> {
  const snapshot = await passkeyCollection().where('uid', '==', uid).get();
  return snapshot.docs.map((doc) => toPasskey(doc.id, doc.data()));
}

/**
 * Legt das Credential an. Bewusst `create()` statt `set()`: ein erneut
 * abgespieltes Registrierungs-Response trifft auf eine bereits existierende
 * Doc-ID und schlägt fehl — das ist der Replay-Schutz der Registrierung.
 */
export async function createPasskey(passkey: Passkey): Promise<void> {
  const { id, ...data } = passkey;
  await passkeyCollection().doc(id).create(data);
}

export async function updatePasskeyUsage(
  id: string,
  counter: number,
  challenge: string,
): Promise<void> {
  await passkeyCollection().doc(id).update({
    counter,
    lastChallenge: challenge,
    lastUsedAt: new Date().toISOString(),
  });
}

export async function updatePasskeyLabel(
  id: string,
  label: string,
): Promise<void> {
  await passkeyCollection().doc(id).update({ label });
}

export async function deletePasskeyDoc(id: string): Promise<void> {
  await passkeyCollection().doc(id).delete();
}
