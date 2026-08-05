// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { extractPdfItems, parseFahrtenbuchPdf } from './fahrtenbuchPdfImport';

/**
 * Der Legacy-Build läuft unter Node, der Standard-Build setzt Browser-APIs
 * voraus. Die Einspeisung über `extractPdfItems` gibt es genau dafür.
 */
async function loadPdfjsForNode() {
  // `workerSrc` bleibt unangetastet: Unter Node schaltet pdfjs den echten
  // Worker selbst ab und zeigt `workerSrc` auf den mitgelieferten Fake-Worker.
  // Ein eigener Wert — auch ein leerer — überschreibt das und lässt das Laden
  // des Workers scheitern.
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  return pdfjs as never;
}

describe('Fahrtenbuch-PDF von Ende zu Ende', () => {
  it('liest das Fixture über pdfjs vollständig', async () => {
    // Über `import.meta.dirname` statt einer `file:`-URL: unter jsdom ist
    // `URL` die Implementierung von jsdom, und `readFileSync` erkennt deren
    // Objekte nicht als Dateipfad an.
    const data = new Uint8Array(
      readFileSync(
        join(import.meta.dirname, 'fahrtenbuchPdfImport.fixture.pdf'),
      ),
    );
    const pages = await extractPdfItems(data, loadPdfjsForNode);

    // Der Grund für das Fixture: Was die Parsertests annehmen, muss pdfjs auch
    // wirklich liefern. Der überlaufende Zweck-Text kommt mit dem Start-KM-Wert
    // als **ein** Textstück heraus — nur deshalb braucht es
    // `splitTrailingNumber`.
    expect(pages[0].map((item) => item.text)).toContain(
      'Eigener Einsatzbereich - T1 Verkehrswege freimachen15,134',
    );

    const result = parseFahrtenbuchPdf(pages);

    expect(result.error).toBeUndefined();
    expect(result.vehicleName).toBe('MTF');
    expect(result.kennzeichen).toBe('FW-999XX');
    expect(result.rows).toHaveLength(9);
    // Die Selbstprüfung muss über die ganze Datei aufgehen.
    expect(result.rows.filter((r) => r.problem)).toEqual([]);

    expect(result.rows[4]).toMatchObject({
      zweckStrecke: 'Eigener Einsatzbereich - T1 Verkehrswege freimachen',
      startKm: 15134,
      endeKm: 15142,
    });
    expect(result.rows[5]).toMatchObject({ von: '23:55', bis: '00:29' });
    expect(result.rows[6]).toMatchObject({ treibstoff: 39.4, adBlue: 8.7 });
  });
});
