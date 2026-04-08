/**
 * Utilities for sanitizing user input before interpolation into SVG markup.
 */

/**
 * Escape XML/SVG special characters to prevent injection attacks.
 */
export function escapeXml(unsafe: string): string {
  return unsafe
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Validate that a string is a valid hex CSS color (#RGB or #RRGGBB).
 * Returns the color if valid, otherwise the provided default.
 */
export function sanitizeHexColor(
  value: string,
  defaultColor: string
): string {
  return /^#[0-9a-fA-F]{3,6}$/.test(value) ? value : defaultColor;
}

/** Common CSP header for SVG responses that disallows script execution. */
export const svgSecurityHeaders: Record<string, string> = {
  'Content-Type': 'image/svg+xml',
  'Content-Security-Policy': "default-src 'none'",
};
