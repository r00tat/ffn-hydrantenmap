// 1x1 transparent PNG used as fallback for any image that fails to load
// during capture (cross-origin without CORS, rate-limited tiles, ...).
const TRANSPARENT_PIXEL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';

// Origins that respond with HTML error pages (e.g. Google avatar CDN's 429)
// and thus poison the DOM-to-image pipeline.
const EXCLUDED_IMAGE_HOSTS = [
  'googleusercontent.com',
  'lh3.googleusercontent.com',
  'gravatar.com',
];

// Tags that bring no visual content and risk confusing the SVG/foreignObject
// serialiser used internally by modern-screenshot. <style>/<link> stay in so
// MUI/Emotion CSS-in-JS still resolves.
const EXCLUDED_TAGS = new Set(['SCRIPT', 'NOSCRIPT', 'TEMPLATE']);

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

  // Lazy-load modern-screenshot so it stays out of the main bundle.
  const { domToBlob } = await import('modern-screenshot');

  // Downscale very large layouts so the intermediate SVG/data URL stays
  // small enough for the browser to load.
  const MAX_DIM = 1280;
  const body = document.body;
  const srcW = body.scrollWidth || body.clientWidth || window.innerWidth;
  const srcH = body.scrollHeight || body.clientHeight || window.innerHeight;
  const scale = Math.min(1, MAX_DIM / srcW, MAX_DIM / srcH);

  try {
    return await domToBlob(body, {
      type: 'image/png',
      scale,
      backgroundColor: '#ffffff',
      // Don't try to embed cross-origin webfonts; they fail with SecurityError
      // when the stylesheet origin doesn't allow cssRules access.
      font: false,
      // Drop elements that either bloat the SVG (scripts), are known to fail
      // (Google avatars), or are explicitly opted out via data-skip-screenshot.
      filter: (node) => {
        if (!(node instanceof HTMLElement)) return true;
        if (EXCLUDED_TAGS.has(node.tagName)) return false;
        if (node.dataset?.skipScreenshot === 'true') return false;
        if (isExcludedImage(node)) return false;
        return true;
      },
      // Tiles or external avatars that fail to fetch fall back to a 1x1
      // transparent pixel instead of crashing the entire capture.
      fetch: {
        placeholderImage: TRANSPARENT_PIXEL,
      },
    });
  } catch (err) {
    console.warn('bug-report: screenshot failed', describeScreenshotError(err));
    return null;
  }
}
