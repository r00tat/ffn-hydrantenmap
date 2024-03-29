import CloudUploadIcon from '@mui/icons-material/CloudUpload';
import Button from '@mui/material/Button';
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
import { useCallback, useState } from 'react';
import { v4 as uuid } from 'uuid';
import { useFirecallId } from '../../hooks/useFirecall';
import app from '../firebase/firebase';
import LinearProgressWithLabel from './LinearProgressWithLabel';

// Initialize Cloud Storage and get a reference to the service
const storage = getStorage(app);

export async function uploadFile(
  firecallId: string,
  fileName: string,
  data: Blob | Uint8Array | ArrayBuffer,
  metadata?: UploadMetadata,
  onStateChange?: (snapshot: UploadTaskSnapshot) => void
) {
  const fileRef = ref(storage, `/firecall/${firecallId}/files/${fileName}`);

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
}

export default function FileUploader({
  onFileUploadComplete,
}: FileUploaderProps) {
  const firecallId = useFirecallId();
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

  const handleUpload = useCallback(
    async (files: FileList): Promise<void> => {
      console.log(`file upload change `, files);

      if (files) {
        setUploadInProgress(true);
        // setFileList(files);
        setProgress({});
        const refs = (
          await Promise.allSettled(
            Array.from(files).map(async (file) => {
              const ref = await uploadFile(
                firecallId,
                `${uuid()}-${file.name}`,
                file,
                {
                  contentType: file.type,
                },
                progressCallback
              );
              // onFileUploadComplete(ref);
              return ref;
            })
          )
        )
          .filter((p) => p.status === 'fulfilled')
          .map((p) => (p as PromiseFulfilledResult<StorageReference>).value);
        setUploadInProgress(false);
        onFileUploadComplete(refs);
      }
    },
    [firecallId, onFileUploadComplete, progressCallback]
  );

  return (
    <>
      <Button
        component="label"
        variant="contained"
        startIcon={<CloudUploadIcon />}
      >
        Upload file
        <VisuallyHiddenInput
          type="file"
          multiple
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
      {uploadInProgress && (
        <>
          <Typography>Uploading ... </Typography>
          {progress &&
            Object.values(progress).map((s) => (
              <LinearProgressWithLabel
                key={s.ref.name}
                value={(s.bytesTransferred / s.totalBytes) * 100}
                label={s.ref.name.substring(37)}
              />
            ))}
        </>
      )}
    </>
  );
}
