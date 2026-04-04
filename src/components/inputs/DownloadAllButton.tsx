import DownloadIcon from '@mui/icons-material/Download';
import CircularProgress from '@mui/material/CircularProgress';
import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';
import { useState } from 'react';
import { downloadStorageFile } from './FileDisplay';

export interface DownloadAllButtonProps {
  urls: string[];
}

export default function DownloadAllButton({ urls }: DownloadAllButtonProps) {
  const [loading, setLoading] = useState(false);

  if (urls.length === 0) return null;

  return (
    <Tooltip title="Alle herunterladen">
      <IconButton
        aria-label="download all"
        onClick={async () => {
          setLoading(true);
          try {
            await Promise.all(urls.map((url) => downloadStorageFile(url)));
          } finally {
            setLoading(false);
          }
        }}
        disabled={loading}
      >
        {loading ? <CircularProgress size={24} /> : <DownloadIcon />}
      </IconButton>
    </Tooltip>
  );
}
