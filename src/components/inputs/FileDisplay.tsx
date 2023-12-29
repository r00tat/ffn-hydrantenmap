import { Typography } from '@mui/material';
import {
  FullMetadata,
  getDownloadURL,
  getMetadata,
  getStorage,
  ref,
} from 'firebase/storage';
import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import app from '../firebase/firebase';

// Initialize Cloud Storage and get a reference to the service
const storage = getStorage(app);

export interface FileDisplayProps {
  url: string;
  showTitleIfImage?: boolean;
  edit?: boolean;
}

export default function FileDisplay({
  url,
  showTitleIfImage = false,
}: FileDisplayProps) {
  const [metadata, setMetadata] = useState<FullMetadata>();
  const [imageUrl, setImageUrl] = useState<string>();

  useEffect(() => {
    (async () => {
      const fileRef = ref(storage, url);
      const meta = await getMetadata(fileRef);
      setMetadata(meta);
      // display image content
      const downloadUrl = await getDownloadURL(fileRef);
      setImageUrl(downloadUrl);
    })();
  }, [url]);
  const isImage = metadata?.contentType?.startsWith('image/');

  return (
    <>
      <Link href={imageUrl || url} target="_blank">
        {(!isImage || showTitleIfImage) && (
          <Typography>{ref(storage, url).name}</Typography>
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
    </>
  );
}
