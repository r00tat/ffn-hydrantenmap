import { getStorage, ref, uploadBytesResumable } from 'firebase/storage';
import { v4 as uuid } from 'uuid';
import { mangelImagePath } from '../../common/mangel';
import app from '../firebase/firebase';
import { compressImage } from './compressImage';

const storage = getStorage(app);

/**
 * Lädt ein Bild zu einem Mangel hoch und liefert dessen Storage-Pfad.
 *
 * Der Pfad und nicht die Download-URL: Er ist stabil und wird beim Anzeigen
 * serverseitig zu einer kurzlebigen Signed URL — siehe `mangelImageUrls`.
 *
 * Der Dateiname bekommt eine UUID vorangestellt. Zwei Fotos aus derselben
 * Kamera heißen sonst beide `IMG_0042.jpg`, und die `storage.rules` erlauben
 * nur `create`: Der zweite Upload scheiterte, statt still zu überschreiben.
 */
export async function uploadMangelImage(
  groupId: string,
  mangelId: string,
  file: File,
): Promise<string> {
  const { blob, fileName, contentType } = await compressImage(file);
  const fileRef = ref(
    storage,
    mangelImagePath(groupId, mangelId, `${uuid()}-${fileName}`),
  );
  const task = uploadBytesResumable(fileRef, blob, { contentType });
  await task;
  return task.snapshot.ref.fullPath;
}
