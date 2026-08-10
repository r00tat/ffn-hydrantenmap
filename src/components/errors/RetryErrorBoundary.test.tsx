// @vitest-environment jsdom
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithIntl } from '../../test-utils/intlRender';
import { RetryErrorFallback } from './RetryErrorBoundary';

vi.mock('../firebase/crashlytics', () => ({
  recordError: vi.fn(async () => undefined),
}));

describe('RetryErrorFallback', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows the error message and the default title', () => {
    renderWithIntl(
      <RetryErrorFallback
        error={new Error('Firestore nicht erreichbar')}
        retry={vi.fn()}
        reset={vi.fn()}
      />,
    );

    expect(screen.getByText('Etwas ist schiefgelaufen')).toBeInTheDocument();
    expect(screen.getByText('Firestore nicht erreichbar')).toBeInTheDocument();
  });

  it('prefers an explicit title', () => {
    renderWithIntl(
      <RetryErrorFallback
        title="Doku kaputt"
        error={new Error('boom')}
        retry={vi.fn()}
        reset={vi.fn()}
      />,
    );

    expect(screen.getByText('Doku kaputt')).toBeInTheDocument();
  });

  it('calls retry, not reset, when the button is pressed', async () => {
    const retry = vi.fn();
    const reset = vi.fn();
    renderWithIntl(
      <RetryErrorFallback
        error={new Error('boom')}
        retry={retry}
        reset={reset}
      />,
    );

    await userEvent.click(
      screen.getByRole('button', { name: 'Erneut versuchen' }),
    );

    expect(retry).toHaveBeenCalledTimes(1);
    expect(reset).not.toHaveBeenCalled();
  });

  it('reports the error to crashlytics', async () => {
    const { recordError } = await import('../firebase/crashlytics');
    const error = new Error('boom');

    renderWithIntl(
      <RetryErrorFallback error={error} retry={vi.fn()} reset={vi.fn()} />,
    );

    expect(recordError).toHaveBeenCalledWith(
      error,
      expect.objectContaining({ source: 'retry-error-boundary' }),
    );
  });

  it('handles a non-Error rejection value', () => {
    renderWithIntl(
      <RetryErrorFallback error="kaputt" retry={vi.fn()} reset={vi.fn()} />,
    );

    expect(screen.getByText('kaputt')).toBeInTheDocument();
  });
});
