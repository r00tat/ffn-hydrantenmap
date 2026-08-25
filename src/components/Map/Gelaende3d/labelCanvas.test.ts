// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { clearLabelCache, drawLabel, labelCanvas, labelSize } from './labelCanvas';

function recordingContext() {
  const calls: string[] = [];
  const record =
    (name: string) =>
    (...args: unknown[]) => {
      calls.push(`${name}(${args.join(',')})`);
    };
  const ctx = {
    calls,
    font: '',
    textAlign: '',
    textBaseline: '',
    lineJoin: '',
    lineWidth: 0,
    strokeStyle: '',
    fillStyle: '',
    clearRect: record('clearRect'),
    measureText: (text: string) => ({ width: text.length * 20 }),
    strokeText: record('strokeText'),
    fillText: record('fillText'),
  } as unknown as CanvasRenderingContext2D;
  return { ctx, calls };
}

afterEach(() => {
  clearLabelCache();
  vi.restoreAllMocks();
});

describe('labelSize', () => {
  it('wächst mit der Länge des Textes', () => {
    const { ctx } = recordingContext();
    expect(labelSize(ctx, '1234').width).toBeGreaterThan(
      labelSize(ctx, '12').width
    );
  });

  it('hält die Höhe unabhängig vom Text', () => {
    const { ctx } = recordingContext();
    expect(labelSize(ctx, '1').height).toBe(labelSize(ctx, '123,4').height);
  });
});

describe('drawLabel', () => {
  it('zeichnet die Kontur vor der Füllung', () => {
    const { ctx, calls } = recordingContext();
    drawLabel(ctx, '132', '#ffffff', 100, 60);
    const stroke = calls.findIndex((c) => c.startsWith('strokeText'));
    const fill = calls.findIndex((c) => c.startsWith('fillText'));
    expect(stroke).toBeGreaterThanOrEqual(0);
    // Umgekehrt läge die Kontur über der Zahl und fräße sie auf.
    expect(stroke).toBeLessThan(fill);
  });
});

describe('labelCanvas', () => {
  it('zeichnet dieselbe Angabe nur einmal', () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
      recordingContext().ctx as never
    );
    expect(labelCanvas('132', '#fff')).toBe(labelCanvas('132', '#fff'));
  });

  it('unterscheidet nach Farbe', () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
      recordingContext().ctx as never
    );
    expect(labelCanvas('132', '#fff')).not.toBe(labelCanvas('132', '#000'));
  });
});
