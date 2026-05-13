import DeleteIcon from '@mui/icons-material/Delete';
import DownloadIcon from '@mui/icons-material/Download';
import IconButton from '@mui/material/IconButton';
import Link from '@mui/material/Link';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import {
  FullMetadata,
  deleteObject,
  getBlob,
  getDownloadURL,
  getMetadata,
  getStorage,
  ref,
} from 'firebase/storage';
import { downloadBlob } from '../firebase/download';
import { useTranslations } from 'next-intl';
import { useEffect, useMemo, useState } from 'react';
import ConfirmDialog from '../dialogs/ConfirmDialog';
import app from '../firebase/firebase';

// Initialize Cloud Storage and get a reference to the service
const storage = getStorage(app);

export interface FileDisplayProps {
  url: string;
  showTitleIfImage?: boolean;
  edit?: boolean;
  onDeleteCallback?: (url: string) => void;
  /** Max size for image thumbnails in px (default: 80) */
  imageSize?: number;
}

export async function downloadStorageFile(url: string) {
  const fileRef = ref(storage, url);
  const blob = await getBlob(fileRef);
  downloadBlob(blob, fileRef.name.substring(37));
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
  imageSize = 80,
}: FileDisplayProps) {
  const t = useTranslations('fileDisplay');
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
      <Link href={imageUrl || '#'} target="_blank" rel="noopener noreferrer" underline="hover">
        {(!isImage || showTitleIfImage) && (
          <Typography component="span">{fileRef.name.substring(37)}</Typography>
        )}
        {isImage && imageUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={imageUrl}
            alt={fileRef.name.substring(37)}
            style={{
              maxWidth: imageSize,
              maxHeight: imageSize,
              margin: 2,
              width: 'auto',
              height: 'auto',
            }}
          />
        )}
      </Link>

      <Tooltip title={t('download')}>
        <IconButton
          aria-label="download"
          size="small"
          onClick={async (e) => {
            e.preventDefault();
            await downloadStorageFile(url);
          }}
        >
          <DownloadIcon fontSize="small" />
        </IconButton>
      </Tooltip>
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
          title={t('deleteAttachment')}
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
