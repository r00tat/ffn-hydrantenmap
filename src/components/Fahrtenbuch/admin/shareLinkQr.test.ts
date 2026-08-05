// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const downloadBlobMock = vi.hoisted(() => vi.fn());

vi.mock('../../firebase/download', () => ({
  downloadBlob: downloadBlobMock,
}));

import {
  PrintWindowBlockedError,
  downloadShareLinkQr,
  printShareLinkQr,
  qrPrintDocument,
  serializeQrSvg,
  shareLinkQrFilename,
  svgToPngBlob,
} from './shareLinkQr';

const SVG_NS = 'http://www.w3.org/2000/svg';

function makeSvg(): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, 'svg') as SVGSVGElement;
  svg.setAttribute('width', '200');
  svg.setAttribute('height', '200');
  svg.setAttribute('viewBox', '0 0 29 29');
  const path = document.createElementNS(SVG_NS, 'path');
  path.setAttribute('d', 'M0 0h1v1H0z');
  svg.appendChild(path);
  document.body.appendChild(svg);
  return svg;
}

afterEach(() => {
  document.body.innerHTML = '';
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('serializeQrSvg', () => {
  it('ergänzt den SVG-Namensraum, damit das Markup als Bild dekodierbar ist', () => {
    const markup = serializeQrSvg(makeSvg());
    expect(markup).toContain(`xmlns="${SVG_NS}"`);
    expect(markup).toContain('<path');
  });

  it('verändert das Original im DOM nicht', () => {
    const svg = makeSvg();
    serializeQrSvg(svg);
    expect(svg.getAttribute('xmlns')).toBeNull();
  });
});

describe('shareLinkQrFilename', () => {
  it('nimmt die Gruppen-ID in den Dateinamen auf', () => {
    expect(shareLinkQrFilename('ffnd')).toBe('fahrtenbuch-link-ffnd.png');
  });

  it('entschärft Zeichen, die in Dateinamen nichts verloren haben', () => {
    expect(shareLinkQrFilename('FF/Neusiedl am See')).toBe(
      'fahrtenbuch-link-ff-neusiedl-am-see.png',
    );
  });

  it('bleibt bei einer ID ohne verwertbare Zeichen brauchbar', () => {
    expect(shareLinkQrFilename('///')).toBe('fahrtenbuch-link.png');
  });

  it('nimmt das vorbelegte Fahrzeug auf, damit Aufkleber unterscheidbar sind', () => {
    expect(shareLinkQrFilename('ffnd', 'TLF 2000')).toBe(
      'fahrtenbuch-link-ffnd-tlf-2000.png',
    );
  });
});

describe('qrPrintDocument', () => {
  const labels = {
    heading: 'Fahrtenbuch-Link',
    groupName: 'FF Neusiedl',
    hint: 'Code scannen',
    url: 'https://einsatz.example/fahrtenbuch/teilen/tok',
    locale: 'de',
  };

  it('enthält den QR-Code, die Texte und den Link im Klartext', () => {
    const html = qrPrintDocument('<svg id="qr"></svg>', labels);
    expect(html).toContain('<svg id="qr"></svg>');
    expect(html).toContain('Fahrtenbuch-Link');
    expect(html).toContain('FF Neusiedl');
    expect(html).toContain('Code scannen');
    // Der Klartext-Link ist die Rückfallebene, wenn das Scannen scheitert.
    expect(html).toContain(labels.url);
    expect(html).toContain('lang="de"');
  });

  it('escaped Texte aus der Datenbank', () => {
    const html = qrPrintDocument('<svg></svg>', {
      ...labels,
      groupName: '<img src=x onerror="alert(1)">',
    });
    expect(html).not.toContain('<img src=x');
    expect(html).toContain('&lt;img src=x onerror=&quot;alert(1)&quot;&gt;');
  });

  it('stellt das vorbelegte Fahrzeug heraus', () => {
    const html = qrPrintDocument('<svg></svg>', {
      ...labels,
      vehicleName: 'TLF 2000',
    });
    // Der Ausdruck klebt im Fahrzeug: wer ihn sieht, muss auf einen Blick
    // erkennen, ob der Zettel zum richtigen Fahrzeug gehört.
    expect(html).toContain('class="vehicle"');
    expect(html).toContain('TLF 2000');
  });

  it('lässt die Fahrzeugzeile weg, wenn kein Fahrzeug vorbelegt ist', () => {
    expect(qrPrintDocument('<svg></svg>', labels)).not.toContain(
      'class="vehicle"',
    );
  });

  it('lässt die Gruppenzeile weg, wenn kein Name bekannt ist', () => {
    const html = qrPrintDocument('<svg></svg>', {
      ...labels,
      groupName: undefined,
    });
    expect(html).not.toContain('class="group"');
  });

  it('löst den Druckdialog erst nach dem Laden aus', () => {
    // Ein print() direkt nach document.close() druckt in manchen Browsern eine
    // leere Seite, weil das Layout noch nicht steht.
    expect(qrPrintDocument('<svg></svg>', labels)).toContain(
      'window.onload=function(){window.focus();window.print();};',
    );
  });
});

describe('printShareLinkQr', () => {
  const labels = {
    heading: 'Fahrtenbuch-Link',
    hint: 'Code scannen',
    url: 'https://einsatz.example/fahrtenbuch/teilen/tok',
    locale: 'de',
  };

  it('schreibt die Druckseite in ein neues Fenster', () => {
    const write = vi.fn();
    const close = vi.fn();
    vi.stubGlobal(
      'open',
      vi.fn(() => ({ document: { write, close } })),
    );

    printShareLinkQr(makeSvg(), labels);

    expect(write).toHaveBeenCalledTimes(1);
    expect(write.mock.calls[0][0]).toContain('<path');
    expect(close).toHaveBeenCalledTimes(1);
  });

  it('meldet einen blockierten Pop-up statt still zu scheitern', () => {
    vi.stubGlobal(
      'open',
      vi.fn(() => null),
    );
    expect(() => printShareLinkQr(makeSvg(), labels)).toThrow(
      PrintWindowBlockedError,
    );
  });
});

describe('svgToPngBlob', () => {
  let drawImage: ReturnType<typeof vi.fn>;
  let fillRect: ReturnType<typeof vi.fn>;
  let context: Record<string, unknown>;
  let lastSrc = '';

  beforeEach(() => {
    drawImage = vi.fn();
    fillRect = vi.fn();
    context = { fillRect, drawImage, fillStyle: '' };

    // jsdom bringt weder eine Canvas- noch eine Bild-Dekodierung mit. Getestet
    // wird deshalb die Verdrahtung: was ins Bild geht, was aufs Canvas kommt.
    vi.stubGlobal(
      'Image',
      class {
        onload?: () => void;
        onerror?: () => void;
        constructor(
          public width?: number,
          public height?: number,
        ) {}
        set src(value: string) {
          lastSrc = value;
          queueMicrotask(() => this.onload?.());
        }
      },
    );
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
      context as unknown as CanvasRenderingContext2D,
    );
    vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(
      (callback) => callback(new Blob(['png'], { type: 'image/png' })),
    );
  });

  it('rendert das SVG als data-URL auf ein Canvas der gewünschten Größe', async () => {
    const blob = await svgToPngBlob('<svg id="qr"></svg>', 512);

    expect(lastSrc).toContain('data:image/svg+xml;charset=utf-8,');
    expect(decodeURIComponent(lastSrc.split(',')[1])).toBe('<svg id="qr"></svg>');
    expect(drawImage).toHaveBeenCalledWith(expect.anything(), 0, 0, 512, 512);
    expect(blob.type).toBe('image/png');
  });

  it('füllt den Grund weiß, damit der Code nicht transparent wird', async () => {
    await svgToPngBlob('<svg></svg>', 512);
    // Transparente helle Module wären in jedem Viewer mit dunklem Hintergrund
    // unscannbar.
    expect(context.fillStyle).toBe('#ffffff');
    expect(fillRect).toHaveBeenCalledWith(0, 0, 512, 512);
  });

  it('meldet einen Fehler, wenn das SVG nicht dekodierbar ist', async () => {
    vi.stubGlobal(
      'Image',
      class {
        onload?: () => void;
        onerror?: () => void;
        set src(_value: string) {
          queueMicrotask(() => this.onerror?.());
        }
      },
    );
    await expect(svgToPngBlob('kaputt', 512)).rejects.toThrow(
      'QR code SVG could not be decoded',
    );
  });
});

describe('downloadShareLinkQr', () => {
  it('übergibt PNG und Dateinamen an den Download', async () => {
    vi.stubGlobal(
      'Image',
      class {
        onload?: () => void;
        set src(_value: string) {
          queueMicrotask(() => this.onload?.());
        }
      },
    );
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      fillRect: vi.fn(),
      drawImage: vi.fn(),
      fillStyle: '',
    } as unknown as CanvasRenderingContext2D);
    vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(
      (callback) => callback(new Blob(['png'], { type: 'image/png' })),
    );
    downloadBlobMock.mockReset();

    await downloadShareLinkQr(makeSvg(), 'ffnd');

    expect(downloadBlobMock).toHaveBeenCalledTimes(1);
    const [blob, filename] = downloadBlobMock.mock.calls[0];
    expect((blob as Blob).type).toBe('image/png');
    expect(filename).toBe('fahrtenbuch-link-ffnd.png');

    downloadBlobMock.mockReset();
    await downloadShareLinkQr(makeSvg(), 'ffnd', 'MTF');
    expect(downloadBlobMock.mock.calls[0][1]).toBe(
      'fahrtenbuch-link-ffnd-mtf.png',
    );
  });
});
