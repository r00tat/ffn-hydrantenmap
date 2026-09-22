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
 * Validate that a string is a valid hex CSS color and return it, otherwise the
 * provided default.
 *
 * Gültig sind genau die vier Längen, die CSS kennt: `#RGB`, `#RGBA`, `#RRGGBB`
 * und `#RRGGBBAA`. Die Alpha-Formen gehören dazu, weil der Farbwähler des
 * Elementdialogs (`MuiColorInput` mit `format="hex8"`) acht Stellen liefert —
 * ohne sie fiele jede dort gewählte Farbe auf den Vorgabewert zurück. Die
 * ungeraden Längen dazwischen sind keine Farben und werden abgewiesen.
 */
export function sanitizeHexColor(
  value: string,
  defaultColor: string
): string {
  return /^#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(value)
    ? value
    : defaultColor;
}

/** Common CSP header for SVG responses that disallows script execution. */
export const svgSecurityHeaders: Record<string, string> = {
  'Content-Type': 'image/svg+xml',
  'Content-Security-Policy': "default-src 'none'",
};
