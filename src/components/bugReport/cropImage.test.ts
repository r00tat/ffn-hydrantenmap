// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  MIN_SELECTION_PX,
  containRect,
  cropImageBlob,
  mapSelectionToImage,
  normalizeRect,
} from './cropImage';

describe('normalizeRect', () => {
  it('builds a positive rectangle from two points in any drag direction', () => {
    const expected = { x: 10, y: 20, width: 30, height: 40 };
    expect(normalizeRect({ x: 10, y: 20 }, { x: 40, y: 60 })).toEqual(expected);
    expect(normalizeRect({ x: 40, y: 60 }, { x: 10, y: 20 })).toEqual(expected);
    expect(normalizeRect({ x: 40, y: 20 }, { x: 10, y: 60 })).toEqual(expected);
    expect(normalizeRect({ x: 10, y: 60 }, { x: 40, y: 20 })).toEqual(expected);
  });
});

describe('containRect', () => {
  it('letterboxes a wide image vertically', () => {
    // 2000x1000 in a 400x400 box → 400x200, 100px bars top and bottom.
    expect(containRect({ width: 400, height: 400 }, { width: 2000, height: 1000 })).toEqual({
      x: 0,
      y: 100,
      width: 400,
      height: 200,
    });
  });

  it('pillarboxes a tall image horizontally', () => {
    expect(containRect({ width: 400, height: 400 }, { width: 500, height: 1000 })).toEqual({
      x: 100,
      y: 0,
      width: 200,
      height: 400,
    });
  });

  it('upscales a small image like object-fit: contain does', () => {
    expect(containRect({ width: 400, height: 200 }, { width: 100, height: 100 })).toEqual({
      x: 100,
      y: 0,
      width: 200,
      height: 200,
    });
  });
});

describe('mapSelectionToImage', () => {
  const box = { width: 400, height: 400 };
  const natural = { width: 2000, height: 1000 };

  it('maps a selection in displayed pixels to natural image pixels', () => {
    // Displayed image starts at y=100 with a scale of 0.2 (2000 → 400).
    const result = mapSelectionToImage({ x: 40, y: 120, width: 100, height: 50 }, box, natural);
    expect(result).toEqual({ x: 200, y: 100, width: 500, height: 250 });
  });

  it('accepts a selection with negative width/height (dragged up-left)', () => {
    const result = mapSelectionToImage({ x: 140, y: 170, width: -100, height: -50 }, box, natural);
    expect(result).toEqual({ x: 200, y: 100, width: 500, height: 250 });
  });

  it('clamps a selection reaching into the letterbox bars', () => {
    // From the top bar (y=50) to below the image (y=350): clamped to the image.
    const result = mapSelectionToImage({ x: -20, y: 50, width: 500, height: 300 }, box, natural);
    expect(result).toEqual({ x: 0, y: 0, width: 2000, height: 1000 });
  });

  it('returns null for a selection that lies entirely in a bar', () => {
    expect(mapSelectionToImage({ x: 10, y: 10, width: 100, height: 50 }, box, natural)).toBeNull();
  });

  it('returns null for a selection below the minimum size (a tap, not a drag)', () => {
    expect(
      mapSelectionToImage(
        { x: 100, y: 150, width: MIN_SELECTION_PX - 1, height: 100 },
        box,
        natural,
      ),
    ).toBeNull();
    expect(
      mapSelectionToImage({ x: 100, y: 150, width: 100, height: 3 }, box, natural, { minSize: 4 }),
    ).toBeNull();
  });

  it('returns null when the box or the image has no size yet', () => {
    const sel = { x: 0, y: 0, width: 100, height: 100 };
    expect(mapSelectionToImage(sel, { width: 0, height: 0 }, natural)).toBeNull();
    expect(mapSelectionToImage(sel, box, { width: 0, height: 0 })).toBeNull();
  });

  it('rounds to whole pixels and stays inside the image', () => {
    const result = mapSelectionToImage(
      { x: 33.3, y: 133.3, width: 366.9, height: 166.9 },
      box,
      natural,
    );
    expect(result).not.toBeNull();
    const r = result!;
    for (const v of [r.x, r.y, r.width, r.height]) {
      expect(Number.isInteger(v)).toBe(true);
    }
    expect(r.x + r.width).toBeLessThanOrEqual(natural.width);
    expect(r.y + r.height).toBeLessThanOrEqual(natural.height);
  });
});

describe('cropImageBlob', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('draws the selected region onto a canvas of that size and returns a PNG', async () => {
    const bitmap = { width: 2000, height: 1000, close: vi.fn() };
    vi.stubGlobal(
      'createImageBitmap',
      vi.fn(async () => bitmap),
    );
    const drawImage = vi.fn();
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      drawImage,
    } as unknown as CanvasRenderingContext2D);
    const out = new Blob(['cropped'], { type: 'image/png' });
    let canvasSize: [number, number] = [0, 0];
    vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(function (
      this: HTMLCanvasElement,
      cb: BlobCallback,
      type?: string,
    ) {
      canvasSize = [this.width, this.height];
      expect(type).toBe('image/png');
      cb(out);
    });

    const result = await cropImageBlob(new Blob(['src']), {
      x: 200,
      y: 100,
      width: 500,
      height: 250,
    });

    expect(result).toBe(out);
    expect(canvasSize).toEqual([500, 250]);
    expect(drawImage).toHaveBeenCalledWith(bitmap, 200, 100, 500, 250, 0, 0, 500, 250);
    expect(bitmap.close).toHaveBeenCalled();
  });

  it('returns null when no 2D context is available', async () => {
    vi.stubGlobal(
      'createImageBitmap',
      vi.fn(async () => ({ width: 10, height: 10, close: vi.fn() })),
    );
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const result = await cropImageBlob(new Blob(['src']), {
      x: 0,
      y: 0,
      width: 5,
      height: 5,
    });

    expect(result).toBeNull();
    spy.mockRestore();
  });
});
