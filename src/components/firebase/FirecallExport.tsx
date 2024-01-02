import DownloadIcon from '@mui/icons-material/Download';
import { IconButton } from '@mui/material';
import { useCallback } from 'react';
import { exportFirecall } from '../../hooks/useExport';

export interface FirecallExportProps {
  firecallId: string;
}

export function downloadBlob(blob: Blob | MediaSource, filename: string) {
  // Create an object URL for the blob object
  const url = URL.createObjectURL(blob);

  // Create a new anchor element
  const a = document.createElement('a');

  // Set the href and download attributes for the anchor element
  // You can optionally set other attributes like `title`, etc
  // Especially, if the anchor element will be attached to the DOM
  a.href = url;
  a.download = filename || 'download';

  // Click handler that releases the object URL after the element has been clicked
  // This is required for one-off downloads of the blob content
  const clickHandler = () => {
    setTimeout(() => {
      URL.revokeObjectURL(url);
      removeEventListener('click', clickHandler);
    }, 150);
  };

  // Add the click event listener on the anchor element
  // Comment out this line if you don't want a one-off download of the blob content
  a.addEventListener('click', clickHandler, false);

  // Programmatically trigger a click on the anchor element
  // Useful if you want the download to happen automatically
  // Without attaching the anchor element to the DOM
  // Comment out this line if you don't want an automatic download of the blob content
  a.click();

  // Return the anchor element
  // Useful if you want a reference to the element
  // in order to attach it to the DOM or use it in some other way
  return a;
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
