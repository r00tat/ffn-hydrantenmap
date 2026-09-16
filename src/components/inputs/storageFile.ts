import { deleteObject, getBlob, getStorage, ref } from 'firebase/storage';
import { displayFileName } from '../../common/attachmentName';
import { downloadBlob } from '../firebase/download';
import app from '../firebase/firebase';

const storage = getStorage(app);

/**
 * Eine Datei aus dem Storage herunterladen — unter dem Namen, unter dem sie
 * hochgeladen wurde, ohne den UUID-Präfix des Speicherorts.
 */
export async function downloadStorageFile(url: string) {
  const fileRef = ref(storage, url);
  const blob = await getBlob(fileRef);
  downloadBlob(blob, displayFileName(fileRef.name));
}

export async function deleteStorageObject(url: string) {
  const fileRef = ref(storage, url);
  await deleteObject(fileRef);
}
