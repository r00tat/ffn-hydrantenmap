// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';

const { recordErrorMock } = vi.hoisted(() => ({
  recordErrorMock: vi.fn(() => Promise.resolve()),
}));

vi.mock('../firebase/crashlytics', () => ({
  recordError: recordErrorMock,
}));

import ErrorBoundary from './ErrorBoundary';

function Throwing(): React.ReactElement {
  throw new Error('render-boom');
}

function Ok(): React.ReactElement {
  return <span>ok-content</span>;
}

describe('ErrorBoundary', () => {
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

  it('renders the German fallback when a child throws', () => {
    render(
      <ErrorBoundary>
        <Throwing />
      </ErrorBoundary>,
    );

    expect(screen.getByText('Etwas ist schiefgelaufen')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Neu laden' })).toBeInTheDocument();
  });

  it('forwards the error and componentStack to recordError', () => {
    render(
      <ErrorBoundary>
        <Throwing />
      </ErrorBoundary>,
    );

    expect(recordErrorMock).toHaveBeenCalledTimes(1);
    const firstCall = recordErrorMock.mock.calls[0] as unknown as [
      unknown,
      Record<string, unknown> | undefined,
    ];
    const err = firstCall[0];
    const ctx = firstCall[1];
    expect(err).toBeInstanceOf(Error);
    expect((err as Error).message).toBe('render-boom');
    expect(ctx).toEqual(
      expect.objectContaining({ source: 'react-error-boundary' }),
    );
  });

  it('renders children unchanged when nothing throws', () => {
    render(
      <ErrorBoundary>
        <Ok />
      </ErrorBoundary>,
    );

    expect(screen.getByText('ok-content')).toBeInTheDocument();
    expect(recordErrorMock).not.toHaveBeenCalled();
  });
});
