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
// serialisation html-to-image uses. <style>/<link> stay in, otherwise
// CSS-in-JS injected by Emotion/MUI disappears and the screenshot has
// no styling.
const EXCLUDED_TAGS = new Set([
  'SCRIPT',
  'NOSCRIPT',
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

  // The captured SVG is loaded back into an <img> via a data: URL; browsers
  // (especially the data-URL → foreignObject path) start to fail silently
  // above ~2 MB of payload. On wide / high-DPI screens (2560+ px) we must
  // scale the source down before serialising, otherwise toBlob rejects
  // with an opaque image-load-error.
  const MAX_DIM = 1280;
  const body = document.body;
  const srcW = body.scrollWidth || body.clientWidth || window.innerWidth;
  const srcH = body.scrollHeight || body.clientHeight || window.innerHeight;
  const scale = Math.min(1, MAX_DIM / srcW, MAX_DIM / srcH);
  const outW = Math.max(1, Math.ceil(srcW * scale));
  const outH = Math.max(1, Math.ceil(srcH * scale));

  try {
    return await toBlob(body, {
      cacheBust: true,
      pixelRatio: 1,
      width: outW,
      height: outH,
      style:
        scale < 1
          ? {
              transform: `scale(${scale})`,
              transformOrigin: 'top left',
            }
          : {},
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
