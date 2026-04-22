import { Capacitor } from '@capacitor/core';
import { Directory, Filesystem } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';

function sanitizeFilename(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? name;
  return base.replace(/\.\.+/g, '_').replace(/^\.+/, '_') || 'download';
}

async function blobToBase64(blob: Blob): Promise<string> {
  if (typeof FileReader !== 'undefined') {
    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const result = reader.result as string;
        const comma = result.indexOf(',');
        resolve(comma >= 0 ? result.slice(comma + 1) : result);
      };
      reader.onerror = () => reject(reader.error ?? new Error('FileReader failed'));
      reader.readAsDataURL(blob);
    });
  }
  const buffer = await blob.arrayBuffer();
  // Last-resort fallback (non-browser envs). Buffer is available under Node.
  return Buffer.from(new Uint8Array(buffer)).toString('base64');
}

async function nativeShare(blob: Blob, filename: string): Promise<void> {
  const path = sanitizeFilename(filename);
  const data = await blobToBase64(blob);
  const { uri } = await Filesystem.writeFile({
    path,
    data,
    directory: Directory.Cache,
  });
  try {
    await Share.share({
      url: uri,
      title: path,
      dialogTitle: path,
    });
  } catch {
    // User cancelled the share sheet — not an error from our side.
  }
}

function webDownload(blob: Blob | MediaSource, filename: string): void {
  const url = URL.createObjectURL(blob as Blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename || 'download';
  const cleanup = () => {
    setTimeout(() => {
      URL.revokeObjectURL(url);
      a.removeEventListener('click', cleanup);
    }, 150);
  };
  a.addEventListener('click', cleanup, false);
  a.click();
}

/**
 * Download a Blob. On web this triggers a browser download; inside a Capacitor
 * WebView (Android) the blob is written to the app cache and opened via the
 * system Share sheet, since WebViews don't honour `<a download>`.
 */
export async function downloadBlob(
  blob: Blob | MediaSource,
  filename: string,
): Promise<void> {
  if (Capacitor.isNativePlatform() && blob instanceof Blob) {
    await nativeShare(blob, filename);
    return;
  }
  webDownload(blob, filename);
}

export async function downloadText(
  text: string,
  filename: string,
  mimeType: string,
): Promise<void> {
  const blob = new Blob([text], { type: mimeType });
  await downloadBlob(blob, filename);
}

export async function downloadRowsAsCsv(
  rows: unknown[][],
  filename: string,
): Promise<void> {
  const csv = rows
    .map((row) => row.map((v) => (v ? '' + v : '')))
    .map((r) => JSON.stringify(r).replace(/^\[/, '').replace(/\]$/, ''))
    .join('\n');
  await downloadText(csv, filename, 'text/csv');
}
