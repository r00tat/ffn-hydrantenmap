import { Typography } from '@mui/material';
import {
  FullMetadata,
  deleteObject,
  getDownloadURL,
  getMetadata,
  getStorage,
  ref,
} from 'firebase/storage';
import Image from 'next/image';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import app from '../firebase/firebase';
import IconButton from '@mui/material/IconButton';
import Stack from '@mui/material/Stack';
import DeleteIcon from '@mui/icons-material/Delete';
import ConfirmDialog from '../dialogs/ConfirmDialog';

// Initialize Cloud Storage and get a reference to the service
const storage = getStorage(app);

export interface FileDisplayProps {
  url: string;
  showTitleIfImage?: boolean;
  edit?: boolean;
  onDeleteCallback?: (url: string) => void;
}

export async function deleteStorageObject(url: string) {
  // return useCallback(async (url: string) => {
  const fileRef = ref(storage, url);
  await deleteObject(fileRef);
  // }, [])
}

export default function FileDisplay({
  url,
  showTitleIfImage = false,
  edit = false,
  onDeleteCallback,
}: FileDisplayProps) {
  const [metadata, setMetadata] = useState<FullMetadata>();
  const [imageUrl, setImageUrl] = useState<string>();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const fileRef = useMemo(() => ref(storage, url), [url]);

  useEffect(() => {
    (async () => {
      const meta = await getMetadata(fileRef);
      setMetadata(meta);
      // display image content
      const downloadUrl = await getDownloadURL(fileRef);
      setImageUrl(downloadUrl);
    })();
  }, [fileRef]);
  const isImage = metadata?.contentType?.startsWith('image/');

  return (
    <>
      <Link href={imageUrl || url} target="_blank">
        {(!isImage || showTitleIfImage) && (
          <Typography>{fileRef.name.substring(37)}</Typography>
        )}
        {isImage && imageUrl && (
          <Image
            src={imageUrl}
            style={{ maxWidth: 80, maxHeight: 80, margin: 2 }}
            alt={url}
            width={80}
            height={80}
          />
        )}
      </Link>
      {edit && (
        <IconButton
          aria-label="delete"
          onClick={(e) => {
            setConfirmDelete(true);
            e.preventDefault();
          }}
        >
          <DeleteIcon />
        </IconButton>
      )}
      {confirmDelete && (
        <ConfirmDialog
          title="Anhang löschen"
          text={`Anhang ${fileRef.name.substring(37)} löschen?`}
          onConfirm={async (confirmed) => {
            if (confirmed) {
              await deleteStorageObject(url);
              if (onDeleteCallback) {
                onDeleteCallback(url);
              }
            }
            setConfirmDelete(false);
          }}
        />
      )}
    </>
  );
}
