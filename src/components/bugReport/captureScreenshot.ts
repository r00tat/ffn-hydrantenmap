export function isScreenshotSupported(): boolean {
  return typeof document !== 'undefined';
}

export async function captureScreenshot(): Promise<Blob | null> {
  if (!isScreenshotSupported()) return null;

  // Lazy-load html-to-image so it stays out of the main bundle.
  const { toBlob } = await import('html-to-image');

  return toBlob(document.documentElement, {
    cacheBust: true,
    pixelRatio: window.devicePixelRatio || 1,
    backgroundColor: '#ffffff',
  });
}
