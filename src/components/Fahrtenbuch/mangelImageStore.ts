import 'server-only';

import { getDefaultStorageBucket } from '../../server/firebase/storageBucket';

/**
 * Der Storage-Zugriff auf die Mangelbilder — getrennt von `mangelActions.ts`,
 * weil aus einer `'use server'`-Datei nur exportiert werden darf, was eine
 * Action sein soll. Dieselbe Trennung wie bei `mangelStore.ts`.
 */

/** Wie lange eine signierte Bild-URL gilt. */
const SIGNED_URL_TTL_MS = 60 * 60 * 1000;

/**
 * Signierte Lese-URLs zu den Bildern eines Mangels.
 *
 * Die `storage.rules` verweigern jedem Client das Lesen: Ob jemand die Bilder
 * sehen darf, hängt an der Mitgliedschaft in der Gruppe, und die steht in
 * Firestore — für eine Storage-Regel nur über einen `firestore.get` auf die
 * Default-Datenbank erreichbar, was in der Dev-Datenbank `ffndev` die falsche
 * Antwort gäbe. Deshalb prüft die Server Action die Mitgliedschaft und
 * signiert erst danach.
 */
export async function signMangelImages(paths: string[]): Promise<string[]> {
  if (paths.length === 0) return [];
  const bucket = await getDefaultStorageBucket();
  return Promise.all(
    paths.map(async (path) => {
      const [url] = await bucket.file(path).getSignedUrl({
        action: 'read',
        expires: Date.now() + SIGNED_URL_TTL_MS,
      });
      return url;
    }),
  );
}

/**
 * Löscht Bilddateien. Ein fehlendes Objekt ist kein Fehler
 * (`ignoreNotFound`): Beim zweiten Anlauf nach einem Teilerfolg wäre sonst
 * ausgerechnet die schon aufgeräumte Datei das Hindernis.
 *
 * Wirft nicht: Das Löschen des Datensatzes ist der Vorgang, das Aufräumen der
 * Dateien seine Folge. Eine verwaiste Datei im Storage ist ein kleineres Übel
 * als ein Mangel, der sich nicht löschen lässt.
 */
export async function deleteMangelImages(paths: string[]): Promise<void> {
  if (paths.length === 0) return;
  const bucket = await getDefaultStorageBucket();
  await Promise.all(
    paths.map(async (path) => {
      try {
        await bucket.file(path).delete({ ignoreNotFound: true });
      } catch (err) {
        console.error('deleteMangelImages: Datei nicht gelöscht', err, path);
      }
    }),
  );
}
