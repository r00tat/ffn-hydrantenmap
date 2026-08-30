import { getStorage, ref, uploadBytesResumable } from 'firebase/storage';
import { v4 as uuid } from 'uuid';
import {
  STAMMDATEN_LOGO_MAX_BYTES,
  isAllowedLogoType,
  stammdatenLogoPath,
} from '../../common/groupStammdaten';
import app from '../firebase/firebase';

const storage = getStorage(app);

export type LogoUploadFehler = 'logoTooLarge' | 'logoWrongType' | 'logoUploadFailed';

export interface LogoUploadErgebnis {
  logoPath?: string;
  error?: LogoUploadFehler;
}

/**
 * Lädt ein Logo hoch und liefert seinen Storage-Pfad.
 *
 * Der Pfad und nicht die Download-URL: Er ist stabil und wird zur Anzeige
 * serverseitig zu einer kurzlebigen Signed URL — wie bei den Mangel-Bildern.
 *
 * Größe und Typ werden hier *und* in den `storage.rules` geprüft. Die Regel
 * ist die Schranke, diese Prüfung die Auskunft: Ohne sie antwortet der
 * Storage nur mit `storage/unauthorized`, und niemand erfährt, dass die Datei
 * zu groß war.
 *
 * Der Dateiname bekommt eine UUID vorangestellt — die Regel erlaubt nur
 * `create`, ein zweiter Upload gleichen Namens scheiterte sonst.
 */
export async function uploadStammdatenLogo(
  groupId: string,
  file: File,
): Promise<LogoUploadErgebnis> {
  if (!isAllowedLogoType(file.type)) return { error: 'logoWrongType' };
  if (file.size >= STAMMDATEN_LOGO_MAX_BYTES) return { error: 'logoTooLarge' };
  try {
    const fileRef = ref(storage, stammdatenLogoPath(groupId, `${uuid()}-${file.name}`));
    const task = uploadBytesResumable(fileRef, file, { contentType: file.type });
    await task;
    return { logoPath: task.snapshot.ref.fullPath };
  } catch (err) {
    console.error('uploadStammdatenLogo failed', err);
    return { error: 'logoUploadFailed' };
  }
}
