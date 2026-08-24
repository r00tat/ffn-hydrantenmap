'use server';
import 'server-only';

import { FieldValue } from 'firebase-admin/firestore';
import { listUsers } from '../../app/api/users/listUsers';
import { actionAdminRequired } from '../../app/auth';
import { userSessionCache } from '../../server/auth/userSessionCache';
import { firestore } from '../../server/firebase/admin';
import { USER_COLLECTION_ID } from '../firebase/firestore';
import { assertFahrtenbuchGroup } from './authGuards';

/** Ein wählbarer Benutzer für das Gerätemeister-Formular. */
export interface GeraetemeisterCandidate {
  uid: string;
  displayName: string;
  email: string;
}

export interface GeraetemeisterOptionsResult {
  success: boolean;
  /** Alle Mitglieder der Gruppe, nach Anzeigename sortiert. */
  members: GeraetemeisterCandidate[];
  /** UIDs der aktuell eingetragenen Gerätemeister. */
  selected: string[];
  error?: string;
}

export interface GeraetemeisterSaveResult {
  success: boolean;
  error?: string;
}

/**
 * Mitglieder der Gruppe plus die aktuell eingetragenen Gerätemeister.
 *
 * Die Rolle steht am Benutzerdokument, es gibt also keine Liste je Gruppe, die
 * man direkt lesen könnte — sie entsteht aus `listUsers()`. Das ist vertretbar:
 * Die Benutzerliste wird für die Auswahl ohnehin gebraucht, und das Formular
 * ist admin-only.
 */
export async function getFahrtenbuchGeraetemeisterOptions(
  groupId: string,
): Promise<GeraetemeisterOptionsResult> {
  try {
    await actionAdminRequired();
    assertFahrtenbuchGroup(groupId);

    const users = await listUsers();
    const members = users.filter((user) => user.groups?.includes(groupId));

    return {
      success: true,
      members: members
        .map((user) => ({
          uid: user.uid,
          displayName: user.displayName || user.email || user.uid,
          email: user.email || '',
        }))
        .sort((a, b) => a.displayName.localeCompare(b.displayName)),
      selected: members
        .filter((user) => user.fahrtenbuchGeraetemeister?.includes(groupId))
        .map((user) => user.uid),
    };
  } catch (err) {
    console.error('getFahrtenbuchGeraetemeisterOptions failed', err);
    return {
      success: false,
      members: [],
      selected: [],
      error: (err as Error).message,
    };
  }
}

/**
 * Setzt die Gerätemeister der Gruppe. Eine leere Liste entfernt alle — es gibt
 * bewusst kein zusätzliches Abschalt-Flag.
 *
 * Geschrieben wird mit `arrayUnion`/`arrayRemove` statt die Liste am
 * Benutzerdokument neu zu setzen: Zwei Admins, die gleichzeitig zwei
 * *verschiedene* Gruppen pflegen, fassen dasselbe Benutzerdokument an und
 * überschrieben sich sonst gegenseitig.
 */
export async function saveFahrtenbuchGeraetemeister(
  groupId: string,
  uids: string[],
): Promise<GeraetemeisterSaveResult> {
  try {
    await actionAdminRequired();
    assertFahrtenbuchGroup(groupId);

    const users = await listUsers();
    const memberIds = new Set(
      users
        .filter((user) => user.groups?.includes(groupId))
        .map((user) => user.uid),
    );

    const wanted = new Set(uids);
    // Ein Nicht-Mitglied wird abgelehnt und nicht still verworfen: Sonst
    // verschwände ein Name nach dem Speichern ohne Erklärung aus dem Formular.
    for (const uid of wanted) {
      if (!memberIds.has(uid)) {
        return { success: false, error: 'notAMember' };
      }
    }

    const current = new Set(
      users
        .filter((user) => user.fahrtenbuchGeraetemeister?.includes(groupId))
        .map((user) => user.uid),
    );

    const added = [...wanted].filter((uid) => !current.has(uid));
    const removed = [...current].filter((uid) => !wanted.has(uid));
    if (added.length === 0 && removed.length === 0) {
      return { success: true };
    }

    const batch = firestore.batch();
    for (const uid of added) {
      batch.set(
        firestore.collection(USER_COLLECTION_ID).doc(uid),
        { fahrtenbuchGeraetemeister: FieldValue.arrayUnion(groupId) },
        { merge: true },
      );
    }
    for (const uid of removed) {
      batch.set(
        firestore.collection(USER_COLLECTION_ID).doc(uid),
        { fahrtenbuchGeraetemeister: FieldValue.arrayRemove(groupId) },
        { merge: true },
      );
    }
    await batch.commit();

    // Ohne Invalidierung bliebe die Änderung bis zum Cache-Ablauf wirkungslos —
    // dieselbe Mechanik wie in updateUser.ts.
    for (const uid of [...added, ...removed]) {
      userSessionCache.invalidate(uid);
    }

    return { success: true };
  } catch (err) {
    console.error('saveFahrtenbuchGeraetemeister failed', err);
    return { success: false, error: (err as Error).message };
  }
}
