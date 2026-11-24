// @vitest-environment jsdom
import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import type { ObjektDokument } from '../../common/objektplan/objektDokument';
import { renderWithIntl } from '../../test-utils/intlRender';

const render = vi.fn(() => ({ promise: Promise.resolve(), cancel: vi.fn() }));

/** Drei A4-Seiten, zeichnen nichts — gezählt wird, welche Seite gerendert wird. */
const fakePdf = {
  numPages: 3,
  getPage: vi.fn(async (n: number) => ({
    pageNumber: n,
    getViewport: ({ scale }: { scale: number }) => ({
      width: 595 * scale,
      height: 842 * scale,
      convertToViewportPoint: (x: number, y: number) => [x, y],
    }),
    getTextContent: async () => ({ items: [] }),
    render,
  })),
};

vi.mock('./objektDokumente', () => ({
  loadObjektDokumentBlob: vi.fn(async () => new Blob(['%PDF'], { type: 'application/pdf' })),
}));
const getDocument = vi.fn((_options: { data: Uint8Array; wasmUrl?: string }) => ({
  promise: Promise.resolve(fakePdf),
  destroy: vi.fn(),
}));
vi.mock('./pdfPlanIndex', () => ({
  loadPdfjsLib: async () => ({ getDocument }),
  pdfjsWasmUrl: () => 'http://localhost/pdfjs/wasm/',
}));

let resize: ((entries: { contentRect: { width: number; height: number } }[]) => void) | undefined;

beforeAll(() => {
  globalThis.ResizeObserver = class {
    constructor(cb: typeof resize) {
      resize = cb;
    }
    observe() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
  Element.prototype.scrollTo = vi.fn();
  // jsdom liest Blobs nicht als ArrayBuffer.
  Blob.prototype.arrayBuffer ??= async () => new ArrayBuffer(4);
});

import PlanViewer from './PlanViewer';

const dokument: ObjektDokument = {
  id: 'plan',
  name: 'Plan.pdf',
  contentType: 'application/pdf',
  storagePath: 'risikoobjekt/o/plan.pdf',
  size: 4,
  sha256: 'x',
  indexStatus: 'ok',
  seiten: 3,
  createdAt: '2026-01-01T00:00:00Z',
  createdBy: 'drive',
};

async function mount(props: { page?: number; highlights?: [number, number, number, number][] }) {
  renderWithIntl(<PlanViewer dokument={dokument} page={props.page ?? 1} highlights={props.highlights} />);
  // 400 px breit, 300 px hoch: eine Seite ist 566 px hoch.
  await waitFor(() => expect(resize).toBeDefined());
  act(() => resize!([{ contentRect: { width: 400, height: 300 } }]));
  return screen.findAllByTestId('plan-page');
}

describe('PlanViewer', () => {
  it('stellt alle Seiten untereinander und rendert nur die nahen', async () => {
    const pages = await mount({});
    expect(pages).toHaveLength(3);
    // Seite 1: 400 × 566,05 px, dann 8 px Abstand.
    expect(getComputedStyle(pages[1]).top).toBe('574.05px');
    expect(screen.getByText('Seite 1 von 3')).toBeInTheDocument();
    // Sichtbar plus eine Bildschirmhöhe: Seite 1 und 2, nicht 3.
    await waitFor(() => expect(render).toHaveBeenCalledTimes(2));
  });

  it('markiert den Treffer auf der Zielseite', async () => {
    await mount({ page: 2, highlights: [[0.1, 0.1, 0.2, 0.2]] });
    const pages = screen.getAllByTestId('plan-page');
    expect(pages[1].querySelectorAll('[data-testid="plan-mark"]')).toHaveLength(1);
    expect(pages[0].querySelectorAll('[data-testid="plan-mark"]')).toHaveLength(0);
  });
});

describe('PlanViewer – Sprung zum Treffer', () => {
  it('zoomt auf den Treffer und bei erneutem Sprung wieder, nachdem der Benutzer gezoomt hat', async () => {
    const box: [number, number, number, number] = [0.1, 0.1, 0.12, 0.11];
    const view = renderWithIntl(
      <PlanViewer dokument={dokument} page={2} highlights={[box]} jumpKey={1} />,
    );
    await waitFor(() => expect(resize).toBeDefined());
    act(() => resize!([{ contentRect: { width: 400, height: 300 } }]));
    await screen.findAllByTestId('plan-page');
    // Markierung 5,7 px hoch bei eingepasster Seite → Höchstwert 400 %.
    await screen.findByText('400%');

    fireEvent.click(screen.getByLabelText('Verkleinern'));
    expect(screen.getByText('286%')).toBeInTheDocument();

    view.rerender(<PlanViewer dokument={dokument} page={2} highlights={[box]} jumpKey={2} />);
    await screen.findByText('400%');
  });
});

describe('PlanViewer – Darstellung und Bedienung', () => {
  it('gibt pdfjs den Pfad zu den WebAssembly-Decodern mit (JBIG2 in Scans)', async () => {
    await mount({});
    expect(getDocument).toHaveBeenCalledWith(
      expect.objectContaining({ wasmUrl: 'http://localhost/pdfjs/wasm/' }),
    );
  });

  it('vergrößert den Plan über einen eigenen Knopf, ohne den Zoom zu ändern', async () => {
    const onToggle = vi.fn();
    const view = renderWithIntl(
      <PlanViewer dokument={dokument} page={1} onToggleExpanded={onToggle} />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Plan vergrößern (Suche ausblenden)' }));
    expect(onToggle).toHaveBeenCalledTimes(1);
    expect(screen.getByText('100%')).toBeInTheDocument();
    view.rerender(
      <PlanViewer dokument={dokument} page={1} expanded onToggleExpanded={onToggle} />,
    );
    expect(
      screen.getByRole('button', { name: 'Suche und Unterlagen einblenden' }),
    ).toBeInTheDocument();
  });

  it('zoomt mit zwei Fingern um den Punkt zwischen den Fingern', async () => {
    await mount({});
    const scroller = screen.getByTestId('plan-pages').parentElement!;
    const touches = (a: number, b: number) => [
      { clientX: 100 - a, clientY: 100 },
      { clientX: 100 + b, clientY: 100 },
    ];
    fireEvent.touchStart(scroller, { touches: touches(20, 20) });
    fireEvent.touchMove(scroller, { touches: touches(40, 40) });
    expect(getComputedStyle(screen.getByTestId('plan-pages')).transformOrigin).toBe('100px 100px');
    fireEvent.touchEnd(scroller, { touches: [] });
    expect(screen.getByText('200%')).toBeInTheDocument();
    // Der Punkt (100, 100) der Spalte liegt jetzt bei (200, 200) — die
    // Scrollposition rückt um 100 px nach, damit er unter den Fingern bleibt.
    expect(scroller.scrollLeft).toBe(100);
    expect(scroller.scrollTop).toBe(100);
  });
});
