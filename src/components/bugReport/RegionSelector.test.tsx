// @vitest-environment jsdom
import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithIntl as render } from '../../test-utils/intlRender';

const cropImageBlobMock = vi.fn();
vi.mock('./cropImage', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./cropImage')>();
  return {
    ...actual,
    cropImageBlob: (...args: unknown[]) => cropImageBlobMock(...args),
  };
});

const showSnackbarMock = vi.fn();
vi.mock('../providers/SnackbarProvider', () => ({
  useSnackbar: () => showSnackbarMock,
}));

import RegionSelector from './RegionSelector';

beforeAll(() => {
  // jsdom has no PointerEvent; without it fireEvent drops clientX/clientY.
  if (typeof window.PointerEvent === 'undefined') {
    class PointerEventPolyfill extends MouseEvent {
      pointerId: number;
      pointerType: string;
      constructor(type: string, init: PointerEventInit = {}) {
        super(type, init);
        this.pointerId = init.pointerId ?? 1;
        this.pointerType = init.pointerType ?? 'mouse';
      }
    }
    // @ts-expect-error -- test polyfill
    window.PointerEvent = PointerEventPolyfill;
  }
  URL.createObjectURL = vi.fn(() => 'blob:region');
  URL.revokeObjectURL = vi.fn();
});

/** 400x400 surface showing a 2000x1000 image: 100px bars top and bottom. */
function prepareLayout() {
  const img = screen.getByAltText(/eingefrorene bildschirmaufnahme/i);
  Object.defineProperty(img, 'naturalWidth', { configurable: true, value: 2000 });
  Object.defineProperty(img, 'naturalHeight', { configurable: true, value: 1000 });
  const surface = screen.getByTestId('region-surface');
  vi.spyOn(surface, 'getBoundingClientRect').mockReturnValue({
    x: 0,
    y: 0,
    left: 0,
    top: 0,
    right: 400,
    bottom: 400,
    width: 400,
    height: 400,
    toJSON: () => ({}),
  } as DOMRect);
  fireEvent.load(img);
  return surface;
}

function drag(surface: HTMLElement, from: [number, number], to: [number, number]) {
  fireEvent.pointerDown(surface, {
    clientX: from[0],
    clientY: from[1],
    button: 0,
    pointerId: 1,
  });
  fireEvent.pointerMove(surface, { clientX: to[0], clientY: to[1], pointerId: 1 });
  fireEvent.pointerUp(surface, { clientX: to[0], clientY: to[1], pointerId: 1 });
}

describe('RegionSelector', () => {
  const image = new Blob(['full'], { type: 'image/png' });

  beforeEach(() => {
    cropImageBlobMock.mockReset();
    showSnackbarMock.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('is excluded from screenshots and blocks other hotkeys', () => {
    render(<RegionSelector open image={image} onConfirm={vi.fn()} onCancel={vi.fn()} />);
    const root = screen.getByTestId('region-selector');
    expect(root).toHaveAttribute('data-skip-screenshot', 'true');
    expect(root).toHaveAttribute('data-hotkeys-block', 'true');
  });

  it('enables "Bereich übernehmen" only once a region was dragged', () => {
    render(<RegionSelector open image={image} onConfirm={vi.fn()} onCancel={vi.fn()} />);
    const surface = prepareLayout();
    const confirm = screen.getByRole('button', { name: /bereich übernehmen/i });
    expect(confirm).toBeDisabled();

    drag(surface, [40, 120], [140, 170]);
    expect(confirm).not.toBeDisabled();
  });

  it('crops the dragged region in natural pixels and hands back the result', async () => {
    const cropped = new Blob(['crop'], { type: 'image/png' });
    cropImageBlobMock.mockResolvedValueOnce(cropped);
    const onConfirm = vi.fn();
    render(<RegionSelector open image={image} onConfirm={onConfirm} onCancel={vi.fn()} />);
    const surface = prepareLayout();

    // Dragged bottom-right → top-left: normalized like any other direction.
    drag(surface, [140, 170], [40, 120]);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /bereich übernehmen/i }));
    });

    expect(cropImageBlobMock).toHaveBeenCalledWith(image, {
      x: 200,
      y: 100,
      width: 500,
      height: 250,
    });
    await waitFor(() => expect(onConfirm).toHaveBeenCalledWith(cropped));
  });

  it('confirms with Enter', async () => {
    const cropped = new Blob(['crop'], { type: 'image/png' });
    cropImageBlobMock.mockResolvedValueOnce(cropped);
    const onConfirm = vi.fn();
    render(<RegionSelector open image={image} onConfirm={onConfirm} onCancel={vi.fn()} />);
    const surface = prepareLayout();
    drag(surface, [40, 120], [140, 170]);

    await act(async () => {
      fireEvent.keyDown(screen.getByTestId('region-selector-content'), {
        key: 'Enter',
      });
    });
    await waitFor(() => expect(onConfirm).toHaveBeenCalledWith(cropped));
  });

  it('a tap without dragging does not count as a region', () => {
    render(<RegionSelector open image={image} onConfirm={vi.fn()} onCancel={vi.fn()} />);
    const surface = prepareLayout();
    drag(surface, [100, 200], [102, 201]);
    expect(screen.getByRole('button', { name: /bereich übernehmen/i })).toBeDisabled();
  });

  it('drawing again replaces the previous selection', async () => {
    cropImageBlobMock.mockResolvedValueOnce(new Blob(['c']));
    render(<RegionSelector open image={image} onConfirm={vi.fn()} onCancel={vi.fn()} />);
    const surface = prepareLayout();
    drag(surface, [40, 120], [140, 170]);
    drag(surface, [0, 100], [400, 300]);

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /bereich übernehmen/i }));
    });
    expect(cropImageBlobMock).toHaveBeenCalledWith(image, {
      x: 0,
      y: 0,
      width: 2000,
      height: 1000,
    });
  });

  it('"Ganzer Bildschirm" hands back the uncropped image', () => {
    const onConfirm = vi.fn();
    render(<RegionSelector open image={image} onConfirm={onConfirm} onCancel={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /ganzer bildschirm/i }));
    expect(onConfirm).toHaveBeenCalledWith(image);
    expect(cropImageBlobMock).not.toHaveBeenCalled();
  });

  it('offers "Ganzes Bild behalten" instead when cropping an attached screenshot', () => {
    render(
      <RegionSelector open image={image} mode="crop" onConfirm={vi.fn()} onCancel={vi.fn()} />,
    );
    expect(screen.getByRole('button', { name: /ganzes bild behalten/i })).toBeInTheDocument();
  });

  it('cancels via button and via Escape', () => {
    const onCancel = vi.fn();
    render(<RegionSelector open image={image} onConfirm={vi.fn()} onCancel={onCancel} />);
    fireEvent.click(screen.getByRole('button', { name: /^abbrechen$/i }));
    expect(onCancel).toHaveBeenCalledTimes(1);

    fireEvent.keyDown(screen.getByTestId('region-selector-content'), {
      key: 'Escape',
    });
    expect(onCancel).toHaveBeenCalledTimes(2);
  });

  it('reports a failed crop and stays open', async () => {
    cropImageBlobMock.mockResolvedValueOnce(null);
    const onConfirm = vi.fn();
    render(<RegionSelector open image={image} onConfirm={onConfirm} onCancel={vi.fn()} />);
    const surface = prepareLayout();
    drag(surface, [40, 120], [140, 170]);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /bereich übernehmen/i }));
    });

    await waitFor(() => expect(showSnackbarMock).toHaveBeenCalledWith(expect.any(String), 'error'));
    expect(onConfirm).not.toHaveBeenCalled();
    expect(screen.getByTestId('region-selector')).toBeInTheDocument();
  });
});
