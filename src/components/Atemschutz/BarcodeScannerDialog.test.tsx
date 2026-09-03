// @vitest-environment jsdom
import { act, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithIntl } from '../../test-utils/intlRender';
import type { AtemschutzGeraet } from '../../common/atemschutz';
import type {
  BarcodeScanEvent,
  UseBarcodeScannerOptions,
} from '../../hooks/useBarcodeScanner';
import BarcodeScannerDialog from './BarcodeScannerDialog';

// Der Hook wird ersetzt, nicht die Kamera gemockt: Geprüft wird, was der Dialog
// aus einem Treffer macht, nicht ob getUserMedia läuft — das deckt
// useBarcodeScanner.test.ts ab.
let melde: ((scan: BarcodeScanEvent) => void) | undefined;

vi.mock('../../hooks/useBarcodeScanner', () => ({
  default: ({ onDetected }: UseBarcodeScannerOptions) => {
    melde = onDetected;
    return {
      videoRef: { current: null },
      status: 'running',
      engine: 'zxing',
      frameSize: { width: 640, height: 480 },
      frames: 120,
    };
  },
}));

const geraet = (over: Partial<AtemschutzGeraet> = {}): AtemschutzGeraet => ({
  id: 'g1',
  typ: 'maske',
  bezeichnung: 'Vollmaske',
  feuerwehr: 'Neusiedl am See',
  inventarNr: '2016-MU-046',
  active: true,
  createdAt: '',
  createdBy: '',
  updatedAt: '',
  updatedBy: '',
  ...over,
});

const scan = (over: Partial<BarcodeScanEvent> = {}): BarcodeScanEvent => ({
  value: '2016-MU-046',
  results: [{ rawValue: '2016-MU-046', format: 'code_128' }],
  engine: 'zxing',
  ...over,
});

beforeEach(() => {
  melde = undefined;
});

describe('BarcodeScannerDialog', () => {
  it('zeigt den laufenden Scan, solange nichts gelesen wurde', () => {
    renderWithIntl(
      <BarcodeScannerDialog
        open
        geraete={[]}
        onClose={vi.fn()}
        onPicked={vi.fn()}
      />,
    );
    expect(
      screen.getByText(
        /ZXing \(Fallback\) · Bild 640 × 480 · 120 Bilder geprüft, noch nichts gelesen/,
      ),
    ).toBeInTheDocument();
  });

  it('zeigt Rohtext und Symbologie, wenn kein Gerät dazu passt', () => {
    renderWithIntl(
      <BarcodeScannerDialog
        open
        geraete={[]}
        onClose={vi.fn()}
        onPicked={vi.fn()}
      />,
    );
    act(() => melde?.(scan({ value: '*2N16Q19*', results: [{ rawValue: '*2N16Q19*', format: 'code_39' }] })));
    expect(
      screen.getByText(/Gelesen: „\*2N16Q19\*“ · code_39/),
    ).toBeInTheDocument();
  });

  it('reicht die Rohlesung an den Aufrufer weiter, auch beim eindeutigen Treffer', () => {
    const onPicked = vi.fn();
    const treffer = geraet();
    renderWithIntl(
      <BarcodeScannerDialog
        open
        geraete={[treffer]}
        onClose={vi.fn()}
        onPicked={onPicked}
      />,
    );
    // Genau ein Treffer: Der Dialog schließt sich sofort. Die Rohlesung muss
    // deshalb mitgehen, sonst ist sie für immer verloren.
    act(() => melde?.(scan()));
    expect(onPicked).toHaveBeenCalledWith('2016-MU-046', treffer, scan());
  });

  it('übergeht eine falsch erfasste Seriennummer zugunsten der Inventarnummer', () => {
    const onPicked = vi.fn();
    const echt = geraet({ id: 'echt', inventarNr: '2016-MU-046' });
    const falschErfasst = geraet({
      id: 'falsch',
      bezeichnung: 'Vollatemmaske Normaldruck 4',
      inventarNr: '9001-MU-704',
      seriennummer: '2016-MU-046',
    });
    renderWithIntl(
      <BarcodeScannerDialog
        open
        geraete={[echt, falschErfasst]}
        onClose={vi.fn()}
        onPicked={onPicked}
      />,
    );
    // Ohne die Verdrängung stünde hier eine Auswahl aus zwei Masken.
    act(() => melde?.(scan()));
    expect(onPicked).toHaveBeenCalledWith('2016-MU-046', echt, scan());
  });

  it('nennt bei echter Mehrdeutigkeit je Zeile das treffende Feld', () => {
    const a = geraet({ id: 'a', barcodes: ['4026056001293'] });
    const b = geraet({
      id: 'b',
      bezeichnung: 'Atemluftflasche CFK 6,8 l',
      nummer: '4026056001293',
    });
    renderWithIntl(
      <BarcodeScannerDialog
        open
        geraete={[a, b]}
        onClose={vi.fn()}
        onPicked={vi.fn()}
      />,
    );
    act(() =>
      melde?.(
        scan({
          value: '4026056001293',
          results: [{ rawValue: '4026056001293', format: 'ean_13' }],
        }),
      ),
    );
    expect(screen.getByText(/getroffen über Barcode/)).toBeInTheDocument();
    expect(screen.getByText(/getroffen über Nummer/)).toBeInTheDocument();
  });

  it('nennt bei mehreren Treffern im Bild auch die nicht übernommenen', () => {
    renderWithIntl(
      <BarcodeScannerDialog
        open
        geraete={[]}
        onClose={vi.fn()}
        onPicked={vi.fn()}
      />,
    );
    act(() =>
      melde?.(
        scan({
          value: '*2N16Q19*',
          results: [
            { rawValue: '*2N16Q19*', format: 'code_39' },
            { rawValue: '2016-MU-046', format: 'code_128' },
          ],
        }),
      ),
    );
    expect(
      screen.getByText(/ebenfalls im Bild: „2016-MU-046“ · code_128/),
    ).toBeInTheDocument();
  });
});
