import { Capacitor } from '@capacitor/core';
import { Directory, Filesystem } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { blobToBase64, sanitizeFilename } from '../firebase/download';

/**
 * Teilt einen Einsatz-Link zusammen mit seinem QR-Code über das Teilen-Menü
 * des Geräts — in der Android-App über Capacitor, im Browser über die Web
 * Share API.
 *
 * Der Link steht beim Teilen mit Bild im Text und nicht im Feld `url`: Viele
 * Ziele (WhatsApp, Signal, Mail) übernehmen bei Dateien nur Text und Datei und
 * lassen die URL still fallen. Der Empfänger hätte dann einen QR-Code, aber
 * keinen Link zum Antippen.
 */

/** `unsupported`: kein Teilen-Menü vorhanden, der Aufrufer braucht einen Rückfall. */
export type ShareOutcome = 'shared' | 'cancelled' | 'unsupported';

export interface ShareLinkWithQrOptions {
  url: string;
  title: string;
  /** Begleittext ohne Link — der Link wird angehängt. */
  text: string;
  qrPng: Blob;
  filename: string;
}

/**
 * Dateiname des QR-Bilds. Der Name des Gasts steckt drin, damit mehrere
 * geteilte Codes im Download-Ordner oder im Chat unterscheidbar bleiben.
 */
export function firecallQrFilename(guestName?: string): string {
  const slug = (guestName ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug ? `einsatz-link-${slug}.png` : 'einsatz-link.png';
}

function withLink(text: string, url: string): string {
  return text ? `${text}\n${url}` : url;
}

async function shareNative({
  url,
  title,
  text,
  qrPng,
  filename,
}: ShareLinkWithQrOptions): Promise<ShareOutcome> {
  const { uri } = await Filesystem.writeFile({
    path: sanitizeFilename(filename),
    data: await blobToBase64(qrPng),
    directory: Directory.Cache,
  });
  try {
    await Share.share({
      title,
      text: withLink(text, url),
      files: [uri],
      dialogTitle: title,
    });
    return 'shared';
  } catch {
    // Das Plugin meldet ein geschlossenes Teilen-Menü als Fehler.
    return 'cancelled';
  }
}

function isAbort(err: unknown): boolean {
  return err instanceof DOMException && err.name === 'AbortError';
}

async function shareWeb({
  url,
  title,
  text,
  qrPng,
  filename,
}: ShareLinkWithQrOptions): Promise<ShareOutcome> {
  if (typeof navigator === 'undefined' || !navigator.share) {
    return 'unsupported';
  }
  const file = new File([qrPng], filename, { type: 'image/png' });
  const withFile: ShareData = {
    title,
    text: withLink(text, url),
    files: [file],
  };
  // Desktop-Browser haben oft ein Teilen-Menü, aber ohne Dateien — dann geht
  // wenigstens der Link hinaus.
  const data: ShareData = navigator.canShare?.(withFile)
    ? withFile
    : { title, text, url };
  try {
    await navigator.share(data);
    return 'shared';
  } catch (err) {
    if (isAbort(err)) return 'cancelled';
    throw err;
  }
}

export async function shareLinkWithQr(
  options: ShareLinkWithQrOptions,
): Promise<ShareOutcome> {
  if (Capacitor.isNativePlatform()) return await shareNative(options);
  return await shareWeb(options);
}
