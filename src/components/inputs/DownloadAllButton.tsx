import DownloadIcon from '@mui/icons-material/Download';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { downloadStorageFile } from './FileDisplay';

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
 */
export default function DownloadAllButton({ urls }: DownloadAllButtonProps) {
  const t = useTranslations('fileDisplay');
  const [loading, setLoading] = useState(false);

  if (urls.length === 0) return null;

  return (
    // Eigene Zeile: Die Anhänge darunter sind eine Folge von Inline-Elementen
    // (Name, Bild, Download, Löschen je Datei). Ohne den Block klebte der
    // Knopf an der ersten Datei und las sich wie deren Beschriftung.
    <Box sx={{ display: 'block', mt: 1, mb: 0.5 }}>
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
    </Box>
  );
}
