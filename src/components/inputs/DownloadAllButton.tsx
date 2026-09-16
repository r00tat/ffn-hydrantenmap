import DownloadIcon from '@mui/icons-material/Download';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { downloadStorageFile } from './storageFile';

export interface DownloadAllButtonProps {
  urls: string[];
}

/**
 * Lädt alle Anhänge auf einmal herunter.
 *
 * Beschriftet und nicht bloß ein Icon: Der Knopf steht neben einer Liste von
 * Anhängen, von denen jeder sein eigenes Download-Icon trägt. Als reines Icon
 * war er von einem weiteren Anhang nicht zu unterscheiden und wirkte wie eine
 * Datei zu viel.
 *
 * Wo er steht, bestimmt der Aufrufer: rechts in der Kopfzeile über der Liste,
 * auf die er wirkt.
 */
export default function DownloadAllButton({ urls }: DownloadAllButtonProps) {
  const t = useTranslations('fileDisplay');
  const [loading, setLoading] = useState(false);

  if (urls.length === 0) return null;

  return (
    <Button
      size="small"
      startIcon={loading ? <CircularProgress size={16} /> : <DownloadIcon />}
      disabled={loading}
      onClick={async () => {
        setLoading(true);
        try {
          await Promise.all(urls.map((url) => downloadStorageFile(url)));
        } finally {
          setLoading(false);
        }
      }}
    >
      {t('downloadAll', { count: urls.length })}
    </Button>
  );
}
