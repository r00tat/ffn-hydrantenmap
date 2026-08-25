// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  BADGE_ASPECT,
  BADGE_H,
  BADGE_W,
  clearMarkerBadgeCache,
  drawMarkerBadge,
  markerBadge,
} from './markerBadge';

/** Ein Kontext, der nur mitschreibt, was gezeichnet wurde. */
function recordingContext() {
  const calls: string[] = [];
  const record =
    (name: string) =>
    (...args: unknown[]) => {
      calls.push(`${name}(${args.join(',')})`);
    };
  const ctx = {
    calls,
    clearRect: record('clearRect'),
    save: record('save'),
    restore: record('restore'),
    beginPath: record('beginPath'),
    moveTo: record('moveTo'),
    lineTo: record('lineTo'),
    closePath: record('closePath'),
    arc: record('arc'),
    fill: record('fill'),
    stroke: record('stroke'),
    drawImage: record('drawImage'),
  } as unknown as CanvasRenderingContext2D;
  return { ctx, calls };
}

afterEach(() => {
  clearMarkerBadgeCache();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('drawMarkerBadge', () => {
  it('zeichnet Spitze und Platte', () => {
    const { ctx, calls } = recordingContext();
    drawMarkerBadge(ctx);
    // Erst das Dreieck der Spitze, dann der Kreis der Platte darüber.
    expect(calls.filter((c) => c.startsWith('lineTo'))).toHaveLength(2);
    expect(calls.some((c) => c.startsWith('arc'))).toBe(true);
  });

  it('setzt ohne Symbol einen Punkt statt einer leeren Platte', () => {
    const { ctx, calls } = recordingContext();
    drawMarkerBadge(ctx);
    expect(calls.some((c) => c.startsWith('drawImage'))).toBe(false);
    // Platte plus Punkt sind zwei Kreise.
    expect(calls.filter((c) => c.startsWith('arc'))).toHaveLength(2);
  });

  it('hält das Seitenverhältnis eines Symbols', () => {
    const { ctx, calls } = recordingContext();
    const icon = {} as CanvasImageSource;
    // Ein hochkantes Symbol: 30 breit, 60 hoch.
    drawMarkerBadge(ctx, icon, 30, 60);
    const call = calls.find((c) => c.startsWith('drawImage'));
    expect(call).toBeDefined();
    const [, , , w, h] = call!
      .replace('drawImage(', '')
      .replace(')', '')
      .split(',')
      .map(Number);
    expect(h / w).toBeCloseTo(2, 6);
    expect(Math.max(w, h)).toBeLessThanOrEqual(BADGE_W);
  });
});

describe('markerBadge', () => {
  it('liefert ein Canvas in der Größe der Marke', async () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
      recordingContext().ctx as never
    );
    const canvas = await markerBadge('');
    expect(canvas.width).toBe(BADGE_W);
    expect(canvas.height).toBe(BADGE_H);
    expect(BADGE_ASPECT).toBeCloseTo(0.8, 6);
  });

  it('zeichnet dasselbe Symbol nur einmal', async () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
      recordingContext().ctx as never
    );
    // jsdom lädt keine Bilder; ohne diesen Ersatz meldet es weder `load` noch
    // `error`, und der Abruf liefe in die Frist von `loadIcon`.
    vi.stubGlobal(
      'Image',
      class {
        crossOrigin = '';
        naturalWidth = 24;
        naturalHeight = 24;
        onload: (() => void) | null = null;
        onerror: (() => void) | null = null;
        set src(_url: string) {
          queueMicrotask(() => this.onload?.());
        }
      }
    );
    const first = await markerBadge('/icons/layer.svg');
    const second = await markerBadge('/icons/layer.svg');
    expect(second).toBe(first);
  });
});
