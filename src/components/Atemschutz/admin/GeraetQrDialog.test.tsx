// @vitest-environment jsdom
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BitArray, Code128Reader } from '@zxing/library';
import type { AtemschutzGeraet } from '../../../common/atemschutz';
import { renderWithIntl } from '../../../test-utils/intlRender';

const { printShareLinkQr } = vi.hoisted(() => ({
  printShareLinkQr: vi.fn(),
}));

vi.mock('../../Fahrtenbuch/admin/shareLinkQr', async (original) => ({
  ...(await original<object>()),
  printShareLinkQr,
}));

import GeraetQrDialog from './GeraetQrDialog';

function flasche(over: Partial<AtemschutzGeraet> = {}): AtemschutzGeraet {
  return {
    id: 'g1',
    typ: 'flasche',
    bezeichnung: 'Atemluftflasche CFK 6,8 l',
    feuerwehr: 'Neusiedl am See',
    inventarNr: '2016-FL-035',
    nummer: '2.16.35',
    active: true,
    createdAt: '',
    createdBy: '',
    updatedAt: '',
    updatedBy: '',
    ...over,
  };
}

/**
 * Liest den gezeichneten Strichcode mit dem ZXing-Decoder zurück.
 *
 * Der Test greift dafür in das gerenderte SVG: Was am Bildschirm steht, ist
 * genau das, was gedruckt wird — `printShareLinkQr` serialisiert dasselbe
 * Element. Ein Etikett, das der eigene Scanner nicht liest, ist wertlos.
 */
function decodeSvg(svg: SVGSVGElement): string {
  const pfad = svg.querySelector('path')?.getAttribute('d') ?? '';
  const balken = [...pfad.matchAll(/M(\d+),0h(\d+)/g)].map((m) => ({
    x: Number(m[1]),
    breite: Number(m[2]),
  }));
  const viewBox = (svg.getAttribute('viewBox') ?? '').split(' ');
  const breite = Number(viewBox[2]);
  const rand = 10;

  const row = new BitArray(breite + 2 * rand);
  for (const b of balken) row.setRange(rand + b.x, rand + b.x + b.breite);
  return new Code128Reader().decodeRow(0, row, undefined).getText();
}

describe('GeraetQrDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function render(geraet: AtemschutzGeraet) {
    return renderWithIntl(
      <GeraetQrDialog open geraet={geraet} onClose={() => {}} />,
    );
  }

  it('zeigt zuerst den QR-Code', () => {
    render(flasche());
    expect(
      screen.getByRole('button', { name: 'QR-Code', pressed: true }),
    ).toBeInTheDocument();
  });

  it('druckt den QR-Code quadratisch', async () => {
    const user = userEvent.setup();
    render(flasche());

    await user.click(screen.getByRole('button', { name: 'Drucken' }));

    expect(printShareLinkQr).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ codeShape: 'square', url: '2016-FL-035' }),
    );
  });

  it('zeichnet nach der Umschaltung einen lesbaren Code 128', async () => {
    const user = userEvent.setup();
    render(flasche());

    await user.click(screen.getByRole('button', { name: 'Code 128' }));

    const svg = document.querySelector('svg');
    expect(svg).toBeTruthy();
    // Die führende Kennung, nicht die Flaschennummer — wie beim QR-Code.
    expect(decodeSvg(svg as SVGSVGElement)).toBe('2016-FL-035');
  });

  it('druckt den Code 128 breit statt quadratisch', async () => {
    const user = userEvent.setup();
    render(flasche());

    await user.click(screen.getByRole('button', { name: 'Code 128' }));
    await user.click(screen.getByRole('button', { name: 'Drucken' }));

    expect(printShareLinkQr).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ codeShape: 'linear' }),
    );
  });

  it('sperrt Code 128, wenn die Kennung ein Zeichen außerhalb von ASCII trägt', async () => {
    // Codeset B endet bei `~`. Der Dialog soll das vorher sagen, statt beim
    // Zeichnen zu scheitern.
    render(flasche({ inventarNr: 'Flasche Grün' }));

    expect(screen.getByRole('button', { name: 'Code 128' })).toBeDisabled();
  });

  it('meldet ein Gerät ohne Kennung, statt einen leeren Code zu zeichnen', () => {
    render(
      flasche({ inventarNr: undefined, nummer: undefined, seriennummer: undefined }),
    );

    expect(screen.getByRole('button', { name: 'Drucken' })).toBeDisabled();
  });
});
