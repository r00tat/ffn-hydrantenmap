// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { recordErrorMock } = vi.hoisted(() => ({
  recordErrorMock: vi.fn(() => Promise.resolve()),
}));

vi.mock('../../firebase/crashlytics', () => ({
  recordError: recordErrorMock,
}));

import LayerErrorBoundary from './LayerErrorBoundary';

function Throwing(): React.ReactElement {
  throw new Error('layer-boom');
}

function Ok(): React.ReactElement {
  return <span>layer-content</span>;
}

describe('LayerErrorBoundary', () => {
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    recordErrorMock.mockClear();
    consoleErrorSpy = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  it('renders children when nothing throws', () => {
    render(
      <LayerErrorBoundary name="Stromausfälle">
        <Ok />
      </LayerErrorBoundary>
    );

    expect(screen.getByText('layer-content')).toBeInTheDocument();
    expect(recordErrorMock).not.toHaveBeenCalled();
  });

  it('swallows the error and renders nothing so the map keeps working', () => {
    const { container } = render(
      <>
        <LayerErrorBoundary name="Stromausfälle">
          <Throwing />
        </LayerErrorBoundary>
        <Ok />
      </>
    );

    expect(container.textContent).toBe('layer-content');
  });

  it('reports the failing layer name to crashlytics', () => {
    render(
      <LayerErrorBoundary name="Stromausfälle">
        <Throwing />
      </LayerErrorBoundary>
    );

    expect(recordErrorMock).toHaveBeenCalledTimes(1);
    const [error, context] = recordErrorMock.mock.calls[0] as unknown as [
      unknown,
      Record<string, unknown>,
    ];
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toBe('layer-boom');
    expect(context).toEqual(
      expect.objectContaining({
        source: 'map-layer-error-boundary',
        layer: 'Stromausfälle',
      })
    );
  });

  it('reports only once per layer even if the child keeps throwing', () => {
    const { rerender } = render(
      <LayerErrorBoundary name="Stromausfälle">
        <Throwing />
      </LayerErrorBoundary>
    );

    rerender(
      <LayerErrorBoundary name="Stromausfälle">
        <Throwing />
      </LayerErrorBoundary>
    );

    expect(recordErrorMock).toHaveBeenCalledTimes(1);
  });
});
