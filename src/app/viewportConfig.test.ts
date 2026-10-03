import { describe, expect, it } from 'vitest';
import { appViewport } from './viewportConfig';

describe('appViewport', () => {
  // Ein Pinch, der neben der Karte beginnt (Kopfzeile, Seitenleiste, Chip),
  // zoomte sonst die ganze Seite — danach waren Dialoge breiter als der
  // sichtbare Ausschnitt. Die Karte zoomt Leaflet selbst.
  it('sperrt den Seitenzoom', () => {
    expect(appViewport).toMatchObject({
      width: 'device-width',
      initialScale: 1,
      maximumScale: 1,
      userScalable: false,
    });
  });

  it('behält die Themenfarbe', () => {
    expect(appViewport.themeColor).toBe('#1976d2');
  });
});
