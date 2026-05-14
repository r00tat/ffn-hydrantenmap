import { getStorage, ref, uploadBytesResumable } from 'firebase/storage';
import { v4 as uuid } from 'uuid';
import app from '../firebase/firebase';
import { BUG_REPORT_STORAGE_PREFIX } from '../../common/bugReport';

const storage = getStorage(app);

export async function uploadBugReportFile(
  reportId: string,
  file: Blob,
  fileName: string,
  contentType?: string,
): Promise<string> {
  const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
  const fileRef = ref(
    storage,
    `/${BUG_REPORT_STORAGE_PREFIX}/${reportId}/${uuid()}-${safeName}`,
  );
  const task = uploadBytesResumable(fileRef, file, {
    contentType: contentType ?? file.type,
  });
  await task;
  return task.snapshot.ref.fullPath;
}
