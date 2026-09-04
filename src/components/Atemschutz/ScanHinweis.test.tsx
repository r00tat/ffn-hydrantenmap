// @vitest-environment jsdom
import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderWithIntl } from '../../test-utils/intlRender';
import type { BarcodeScanEvent } from '../../hooks/useBarcodeScanner';
import ScanHinweis, { ScanLauf } from './ScanHinweis';

const scan = (over: Partial<BarcodeScanEvent> = {}): BarcodeScanEvent => ({
  value: '2016-MU-046',
  results: [{ rawValue: '2016-MU-046', format: 'code_128' }],
  engine: 'zxing',
  ...over,
});

describe('ScanHinweis', () => {
  it('zeigt den gelesenen Text und die Symbologie', () => {
    renderWithIntl(<ScanHinweis scan={scan()} />);
    expect(
      screen.getByText(/Gelesen: „2016-MU-046“ · code_128/),
    ).toBeInTheDocument();
  });

  it('benennt den Detektor, damit ein Fehllesen zuzuordnen ist', () => {
    renderWithIntl(<ScanHinweis scan={scan({ engine: 'native' })} />);
    expect(
      screen.getByText(/Erkennung: BarcodeDetector \(nativ\)/),
    ).toBeInTheDocument();
  });

  it('meldet ein fehlendes Format, statt die Stelle leer zu lassen', () => {
    renderWithIntl(
      <ScanHinweis scan={scan({ results: [{ rawValue: '2016-MU-046' }] })} />,
    );
    expect(
      screen.getByText(/Gelesen: „2016-MU-046“ · Format unbekannt/),
    ).toBeInTheDocument();
  });

  it('listet die übrigen Treffer desselben Bildes — sie zeigen den Fehlgriff', () => {
    renderWithIntl(
      <ScanHinweis
        scan={scan({
          value: '*2N16Q19*',
          results: [
            { rawValue: '*2N16Q19*', format: 'code_39' },
            { rawValue: '2016-MU-046', format: 'code_128' },
          ],
        })}
      />,
    );
    expect(
      screen.getByText(/ebenfalls im Bild: „2016-MU-046“ · code_128/),
    ).toBeInTheDocument();
  });
});

describe('ScanLauf', () => {
  it('zeigt Auflösung und geprüfte Bilder, damit „läuft, findet nichts" sichtbar wird', () => {
    renderWithIntl(
      <ScanLauf
        engine="zxing"
        frameSize={{ width: 640, height: 480 }}
        frames={120}
      />,
    );
    expect(
      screen.getByText(
        /ZXing \(Fallback\) · Bild 640 × 480 · 120 Bilder geprüft, noch nichts gelesen/,
      ),
    ).toBeInTheDocument();
  });

  it('kommt ohne bekannte Auflösung aus', () => {
    renderWithIntl(<ScanLauf frames={0} />);
    expect(
      screen.getByText(/noch unbestimmt · Bild Auflösung noch unbekannt/),
    ).toBeInTheDocument();
  });
});
