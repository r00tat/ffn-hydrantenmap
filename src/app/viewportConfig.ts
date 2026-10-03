import type { Viewport } from 'next';

/**
 * Viewport der App, als `viewport` aus dem Root-Layout exportiert.
 *
 * **Seitenzoom gesperrt.** Die App ist eine Einsatzoberfläche mit Karte, kein
 * Lesetext: Ein Pinch, der neben der Karte beginnt (Kopfzeile, Seitenleiste,
 * Chip, FAB), zoomte sonst die ganze Seite, und danach waren Dialoge, die an
 * der Breite des Layout-Viewports hängen, breiter als der sichtbare
 * Ausschnitt — ohne einfachen Weg zurück. Am iPhone kommt das automatische
 * Hineinzoomen in Eingabefelder dazu, das `maximumScale` ebenfalls abstellt.
 * Die Karte zoomt Leaflet selbst; größere Schrift gibt die Systemeinstellung.
 * iOS Safari übergeht `userScalable` beim Pinch, dafür sorgt zusätzlich
 * `touch-action` in `globals.css`.
 *
 * Next setzt das `<meta name="viewport">` daraus selbst — ein zweites von
 * Hand im `<head>` gehört nicht dazu.
 */
export const appViewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: '#1976d2',
};
