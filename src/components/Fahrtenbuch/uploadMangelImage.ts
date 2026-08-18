import { getStorage, ref, uploadBytesResumable } from 'firebase/storage';
import { v4 as uuid } from 'uuid';
import { mangelImagePath } from '../../common/mangel';
import app from '../firebase/firebase';
import type { CompressedImage } from './compressImage';

const storage = getStorage(app);

/**
 * Lädt ein vorbereitetes Bild zu einem Mangel hoch und liefert dessen
 * Storage-Pfad.
 *
 * Der Pfad und nicht die Download-URL: Er ist stabil und wird beim Anzeigen
 * serverseitig zu einer kurzlebigen Signed URL — siehe `mangelImageUrls`.
 *
 * Vorbereitet, nicht roh: `prepareMangelImage` verkleinert und prüft gegen
 * dieselben Bedingungen wie die `storage.rules`. Der Aufrufer bereitet alle
 * Bilder vor, bevor er das erste hochlädt — sonst lägen nach einem abgelehnten
 * dritten Foto die ersten beiden ohne Dokument im Storage.
 *
 * Der Dateiname bekommt eine UUID vorangestellt. Zwei Fotos aus derselben
 * Kamera heißen sonst beide `IMG_0042.jpg`, und die `storage.rules` erlauben
 * nur `create`: Der zweite Upload scheiterte, statt still zu überschreiben.
 */
export async function uploadMangelImage(
  groupId: string,
  mangelId: string,
  image: CompressedImage,
): Promise<string> {
  const fileRef = ref(
    storage,
    mangelImagePath(groupId, mangelId, `${uuid()}-${image.fileName}`),
  );
  const task = uploadBytesResumable(fileRef, image.blob, {
    contentType: image.contentType,
  });
  await task;
  return task.snapshot.ref.fullPath;
}
