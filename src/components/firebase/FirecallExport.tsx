import DownloadIcon from '@mui/icons-material/Download';
import IconButton from '@mui/material/IconButton';
import { exportFirecall } from '../../hooks/useExport';
import { downloadBlob } from './download';

export interface FirecallExportProps {
  firecallId: string;
}

async function exportAndDownloadFirecall(firecallId: string) {
  const firecallData = await exportFirecall(firecallId);
  const blob = new Blob([JSON.stringify(firecallData)], {
    type: 'application/json',
  });
  downloadBlob(blob, `firecall-export-${firecallId}.json`);
}

export default function FirecallExport({ firecallId }: FirecallExportProps) {
  return (
    <IconButton onClick={() => exportAndDownloadFirecall(firecallId)}>
      <DownloadIcon />
    </IconButton>
  );
}
