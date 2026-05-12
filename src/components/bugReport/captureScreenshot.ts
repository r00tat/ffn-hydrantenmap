export function isScreenshotSupported(): boolean {
  return typeof document !== 'undefined';
}

export async function captureScreenshot(): Promise<Blob | null> {
  if (!isScreenshotSupported()) return null;

  // Lazy-load html-to-image so it stays out of the main bundle.
  const { toBlob } = await import('html-to-image');

  try {
    return await toBlob(document.documentElement, {
      cacheBust: true,
      pixelRatio: window.devicePixelRatio || 1,
      backgroundColor: '#ffffff',
      // Cross-origin stylesheets (Google Fonts, Material Icons) cannot be
      // serialised via cssRules; skipping the font-embed step avoids the
      // resulting SecurityError. The screenshot may show fallback fonts.
      skipFonts: true,
    });
  } catch (err) {
    console.warn('bug-report: screenshot failed', err);
    return null;
  }
}
