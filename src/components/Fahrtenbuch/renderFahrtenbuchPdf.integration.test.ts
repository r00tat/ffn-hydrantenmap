// Node-Umgebung: Unter jsdom löst vitest den Browser-Build von
// `@react-pdf/renderer` auf, der `renderToBuffer` nicht kennt. Der Export läuft
// ohnehin auf dem Server.
import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import { extractPdfItems, type PdfTextItem } from './fahrtenbuchPdfImport';
import type {
  ExportSection,
  FahrtenbuchExportModel,
} from './fahrtenbuchExportModel';
import { renderFahrtenbuchPdf } from './renderFahrtenbuchPdf';

/** Wie im Import-Integrationstest: der Legacy-Build läuft unter Node. */
async function loadPdfjsForNode() {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  return pdfjs as never;
}

const COLUMNS = [
  { key: 'datum', label: 'Datum', flex: 1.2 },
  { key: 'fahrer', label: 'Fahrer', flex: 2.2 },
  { key: 'ziel', label: 'Fahrstrecke', flex: 3.4 },
];

function section(vehicleId: string, heading: string, rowCount: number): ExportSection {
  return {
    vehicleId,
    heading,
    columns: COLUMNS,
    rows: Array.from({ length: rowCount }, (_, i) => ({
      cells: [`0${(i % 9) + 1}.06.2026`, 'Martin Tremetzberger', `Fahrt ${i}`],
    })),
  };
}

const FOOTER = 'Erstellt am 15.08.2026 12:00 von Paul Wölfel';

function model(sections: ExportSection[]): FahrtenbuchExportModel {
  return {
    title: 'Fahrtenbuch FF Neusiedl am See',
    period: 'Zeitraum 01.01.2026 - 31.12.2026',
    footer: FOOTER,
    sections,
  };
}

const pageLabel = (page: number, total: number) => `Seite ${page}/${total}`;

/** Alle Textstücke einer Seite zu einer Zeichenkette. */
const textOf = (items: PdfTextItem[]) => items.map((i) => i.text).join(' ');

describe('renderFahrtenbuchPdf', () => {
  it('führt die Teildokumente zu einer Datei mit durchlaufenden Seitenzahlen zusammen', async () => {
    // Mehr Zeilen als in ein Teildokument passen, damit der Zusammenbau
    // tatsächlich stattfindet — genau der Fall aus #665.
    const bytes = await renderFahrtenbuchPdf(
      model([section('v1', 'RLFA 2000 (FW-100ND)', 160), section('v2', 'MTF (FW-200ND)', 40)]),
      pageLabel,
      { rowsPerDocument: 50 },
    );

    expect(Buffer.from(bytes).subarray(0, 5).toString('latin1')).toBe('%PDF-');

    const pages = await extractPdfItems(bytes, loadPdfjsForNode);
    expect(pages.length).toBeGreaterThan(1);

    // Jede Seite trägt genau ihre eigene Nummer und dieselbe Gesamtzahl.
    pages.forEach((items, index) => {
      expect(textOf(items)).toContain(`Seite ${index + 1}/${pages.length}`);
    });
  }, 120000);

  it('setzt die Seitenzahl auf dieselbe Grundlinie wie den Erstellungsvermerk', async () => {
    // Die Zahl wird nach dem Zusammenfügen gestempelt, der Vermerk kommt aus
    // react-pdf. Stünden sie nicht auf einer Linie, wäre der Fuß sichtbar
    // schief.
    const bytes = await renderFahrtenbuchPdf(model([section('v1', 'RLFA 2000', 20)]), pageLabel);

    const [items] = await extractPdfItems(bytes, loadPdfjsForNode);
    const stamped = items.find((i) => i.text.startsWith('Seite '));
    const generated = items.find((i) => i.text.includes('Erstellt am'));

    expect(stamped).toBeDefined();
    expect(generated).toBeDefined();
    expect(stamped!.y).toBeCloseTo(generated!.y, 0);
    // Rechtsbündig am selben Rand wie der linke Vermerk (24 pt).
    expect(stamped!.x + stamped!.width).toBeCloseTo(841.89 - 24, 0);
  }, 120000);

  it('beginnt jedes Fahrzeug auf einer neuen Seite und wiederholt seine Überschrift', async () => {
    const bytes = await renderFahrtenbuchPdf(
      model([section('v1', 'RLFA 2000 (FW-100ND)', 60), section('v2', 'MTF (FW-200ND)', 5)]),
      pageLabel,
      { rowsPerDocument: 50 },
    );

    const pages = await extractPdfItems(bytes, loadPdfjsForNode);
    const headings = pages.map((items) =>
      textOf(items).includes('MTF') ? 'v2' : 'v1',
    );

    // Kein Blatt trägt zwei Fahrzeuge, und v2 fängt hinter v1 an.
    expect(headings[0]).toBe('v1');
    expect(headings.at(-1)).toBe('v2');
    expect(headings.indexOf('v2')).toBe(headings.lastIndexOf('v1') + 1);
  }, 120000);

  it('weist ein Fahrzeug ohne Fahrten aus, statt es wegzulassen', async () => {
    const empty: ExportSection = {
      vehicleId: 'v2',
      heading: 'MTF (FW-200ND)',
      columns: COLUMNS,
      rows: [],
      emptyText: 'Keine Fahrten im Zeitraum.',
    };
    const bytes = await renderFahrtenbuchPdf(
      model([section('v1', 'RLFA 2000', 5), empty]),
      pageLabel,
    );

    const pages = await extractPdfItems(bytes, loadPdfjsForNode);
    expect(pages.map(textOf).join(' ')).toContain('Keine Fahrten im Zeitraum.');
  }, 120000);
});
