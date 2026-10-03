import CloudQueueIcon from '@mui/icons-material/CloudQueue';
import CloudUploadIcon from '@mui/icons-material/CloudUpload';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import Tooltip from '@mui/material/Tooltip';
import { styled } from '@mui/material/styles';
import Typography from '@mui/material/Typography';
import {
  getStorage,
  ref,
  StorageReference,
  uploadBytesResumable,
  UploadMetadata,
  UploadTaskSnapshot,
} from 'firebase/storage';
import { useTranslations } from 'next-intl';
import { useCallback, useState } from 'react';
import { useFirecallId } from '../../hooks/useFirecall';
import { checkConnectivityNow } from '../../lib/connectivity';
import {
  queueUpload,
  usePendingUploads,
  type UploadTarget,
} from '../../lib/uploadQueue';
import { useOnlineOnly } from '../site/OnlineOnly';
import {
  displayFileName,
  storageFileName,
} from '../../common/attachmentName';
import app from '../firebase/firebase';
import { useSnackbar } from '../providers/SnackbarProvider';
import LinearProgressWithLabel from './LinearProgressWithLabel';

// Initialize Cloud Storage and get a reference to the service
const storage = getStorage(app);

export function firecallFilePath(firecallId: string, fileName: string): string {
  return `/firecall/${firecallId}/files/${fileName}`;
}

export async function uploadFile(
  firecallId: string,
  fileName: string,
  data: Blob | Uint8Array | ArrayBuffer,
  metadata?: UploadMetadata,
  onStateChange?: (snapshot: UploadTaskSnapshot) => void
) {
  const fileRef = ref(storage, firecallFilePath(firecallId, fileName));

  const uploadTask = uploadBytesResumable(fileRef, data, metadata);
  if (onStateChange) {
    uploadTask.on('state_changed', onStateChange);
  }
  console.info(`starting upload of ${fileName} to ${fileRef.fullPath}`);
  const result = await uploadTask;
  console.info(`file upload complete`);

  return result.ref;
}

const VisuallyHiddenInput = styled('input')({
  clip: 'rect(0 0 0 0)',
  clipPath: 'inset(50%)',
  height: 1,
  overflow: 'hidden',
  position: 'absolute',
  bottom: 0,
  left: 0,
  whiteSpace: 'nowrap',
  width: 1,
});

export interface FileUploaderProps {
  onFileUploadComplete: (refs: StorageReference[]) => void;
  /**
   * Wohin die Referenz einer offline gewählten Datei kommt. Mit Ziel landet
   * die Datei offline in der Upload-Warteschlange (`src/lib/uploadQueue.ts`):
   * hochgeladen und ins Dokument eingetragen wird nach dem Reconnect, auch
   * wenn der Dialog dann längst zu ist — `onFileUploadComplete` wird dafür
   * nicht aufgerufen. Bis dahin steht ein Platzhalter „wartet auf Upload" da.
   *
   * Ohne Ziel (etwa ein Element, das es noch nicht gibt) ist der Upload
   * offline deaktiviert.
   */
  offlineTarget?: UploadTarget;
}

export default function FileUploader({
  onFileUploadComplete,
  offlineTarget,
}: FileUploaderProps) {
  const firecallId = useFirecallId();
  const showSnackbar = useSnackbar();
  const t = useTranslations('networkStatus');
  const { offline, hint } = useOnlineOnly();
  const pendingUploads = usePendingUploads(offlineTarget);
  const uploadDisabled = offline && !offlineTarget;
  const [uploadInProgress, setUploadInProgress] = useState(false);
  const [progress, setProgress] = useState<{
    [key: string]: UploadTaskSnapshot;
  }>();
  // const [fileList, setFileList] = useState<FileList>();

  const progressCallback = useCallback(
    (snapshot: UploadTaskSnapshot) => {
      // Observe state change events such as progress, pause, and resume
      // Get task progress, including the number of bytes uploaded and the total number of bytes to be uploaded
      setProgress((prev) => ({
        ...prev,
        [snapshot.ref.name]: snapshot,
      }));
    },
    [setProgress]
  );

  const enqueueFiles = useCallback(
    async (files: File[]) => {
      if (!offlineTarget || files.length === 0) return;
      await Promise.all(
        files.map((file) =>
          queueUpload({
            storagePath: firecallFilePath(
              firecallId,
              storageFileName(file.name),
            ),
            blob: file,
            contentType: file.type || undefined,
            fileName: file.name,
            target: offlineTarget,
          }),
        ),
      );
      showSnackbar(t('uploadQueued', { count: files.length }), 'info');
    },
    [firecallId, offlineTarget, showSnackbar, t],
  );

  const handleUpload = useCallback(
    async (files: FileList): Promise<void> => {
      console.log(`file upload change `, files);

      if (files && offline && offlineTarget) {
        await enqueueFiles(Array.from(files));
        return;
      }

      if (files) {
        setUploadInProgress(true);
        // setFileList(files);
        setProgress({});
        const settled = await Promise.allSettled(
          Array.from(files).map(async (file) => {
            const ref = await uploadFile(
              firecallId,
              storageFileName(file.name),
              file,
              {
                contentType: file.type,
              },
              progressCallback
            );
            // onFileUploadComplete(ref);
            return ref;
          })
        );
        const refs = settled
          .filter(
            (p): p is PromiseFulfilledResult<StorageReference> =>
              p.status === 'fulfilled'
          )
          .map((p) => p.value);
        const fileArray = Array.from(files);
        let failed = settled.filter(
          (p): p is PromiseRejectedResult => p.status === 'rejected'
        );
        // Mitten im Upload weggebrochen: Mit Ziel wandern die gescheiterten
        // Dateien in die Warteschlange, statt verloren zu gehen.
        if (
          failed.length > 0 &&
          offlineTarget &&
          !(await checkConnectivityNow().catch(() => false))
        ) {
          await enqueueFiles(
            fileArray.filter((_, i) => settled[i].status === 'rejected'),
          );
          failed = [];
        }
        setUploadInProgress(false);
        // Surface upload failures instead of silently dropping them — otherwise
        // an attachment simply "disappears" after upload with no explanation.
        if (failed.length > 0) {
          failed.forEach((f) => console.error('file upload failed', f.reason));
          showSnackbar(
            `${failed.length} Datei(en) konnten nicht hochgeladen werden.`,
            'error'
          );
        }
        onFileUploadComplete(refs);
      }
    },
    [
      enqueueFiles,
      firecallId,
      offline,
      offlineTarget,
      onFileUploadComplete,
      progressCallback,
      showSnackbar,
    ]
  );

  const button = (
    <Button
      component="label"
      variant="contained"
      startIcon={<CloudUploadIcon />}
      disabled={uploadDisabled}
    >
      Upload file
      <VisuallyHiddenInput
        type="file"
        multiple
        disabled={uploadDisabled}
        onChange={(event) => {
          (async () => {
            if (event.target.files) {
              await handleUpload(event.target.files);
              event.target.value = '';
            }
          })();
        }}
      />
    </Button>
  );

  return (
    <>
      {uploadDisabled ? (
        <Tooltip title={hint}>
          <span>{button}</span>
        </Tooltip>
      ) : (
        button
      )}
      {pendingUploads.length > 0 && (
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mt: 1 }}>
          {pendingUploads.map((p) => (
            <Tooltip key={p.id} title={t('pendingUploadHint')}>
              <Chip
                size="small"
                variant="outlined"
                icon={<CloudQueueIcon />}
                label={t('pendingUpload', { name: p.fileName })}
              />
            </Tooltip>
          ))}
        </Box>
      )}
      {uploadInProgress && (
        <>
          <Typography>Uploading ... </Typography>
          {progress &&
            Object.values(progress).map((s) => (
              <LinearProgressWithLabel
                key={s.ref.name}
                value={(s.bytesTransferred / s.totalBytes) * 100}
                label={displayFileName(s.ref.name)}
              />
            ))}
        </>
      )}
    </>
  );
}
