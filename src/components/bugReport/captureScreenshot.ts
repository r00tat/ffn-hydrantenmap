// 1x1 transparent PNG. Used as fallback for any image html-to-image cannot
// fetch (cross-origin without CORS, blocked, etc). Without this the entire
// screenshot rejects on the first image error.
const TRANSPARENT_PIXEL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';

// Origins that are known to either rate-limit (Google avatar CDN responds
// with HTML 429 pages) or otherwise break html-to-image. Their content is
// not relevant for a bug report and is silently dropped from the capture.
const EXCLUDED_IMAGE_HOSTS = [
  'googleusercontent.com',
  'lh3.googleusercontent.com',
  'gravatar.com',
];

// Tags that bring no visual content but can break the SVG/foreignObject
// serialisation html-to-image uses (script bodies confuse the XML parser,
// <link> cross-origin stylesheets cannot be inlined, ...).
const EXCLUDED_TAGS = new Set([
  'SCRIPT',
  'STYLE',
  'LINK',
  'NOSCRIPT',
  'META',
  'TEMPLATE',
]);

function isExcludedImage(node: HTMLElement): boolean {
  if (node.tagName !== 'IMG') return false;
  const src = (node as HTMLImageElement).src || '';
  return EXCLUDED_IMAGE_HOSTS.some((host) => src.includes(host));
}

function describeScreenshotError(err: unknown): unknown {
  if (err && typeof err === 'object' && 'target' in err) {
    const target = (err as { target?: unknown }).target;
    if (target && typeof target === 'object' && 'src' in target) {
      return {
        kind: 'image-load-error',
        src: String((target as { src?: string }).src).slice(0, 200),
      };
    }
  }
  return err;
}

export function isScreenshotSupported(): boolean {
  return typeof document !== 'undefined';
}

export async function captureScreenshot(): Promise<Blob | null> {
  if (!isScreenshotSupported()) return null;

  // Lazy-load html-to-image so it stays out of the main bundle.
  const { toBlob } = await import('html-to-image');

  try {
    return await toBlob(document.body, {
      cacheBust: true,
      // pixelRatio 1 keeps the resulting SVG payload small enough for the
      // <img> tag to load reliably; higher ratios can overflow the data
      // URL limit and trigger an opaque image-load-error.
      pixelRatio: 1,
      backgroundColor: '#ffffff',
      // Cross-origin stylesheets (Google Fonts, Material Icons) cannot be
      // serialised via cssRules; skip the font-embed step.
      skipFonts: true,
      // Drop elements that either have no visual content but bloat / break
      // the SVG (scripts, link tags, ...), known-bad cross-origin images
      // (Google avatars), or which the page explicitly opts out via
      // data-skip-screenshot.
      filter: (node) => {
        if (!(node instanceof HTMLElement)) return true;
        if (EXCLUDED_TAGS.has(node.tagName)) return false;
        if (node.dataset?.skipScreenshot === 'true') return false;
        if (isExcludedImage(node)) return false;
        return true;
      },
      // Last-resort fallback for any image whose fetch fails outright.
      // Map tiles from CORS-less providers will appear as transparent
      // pixels, but the rest of the page still renders.
      imagePlaceholder: TRANSPARENT_PIXEL,
    });
  } catch (err) {
    console.warn('bug-report: screenshot failed', describeScreenshotError(err));
    return null;
  }
}
