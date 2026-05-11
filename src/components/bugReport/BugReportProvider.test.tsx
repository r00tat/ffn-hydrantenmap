// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

vi.mock('./BugReportDialog', () => ({
  __esModule: true,
  default: ({ open }: { open: boolean; onClose: () => void }) =>
    open ? <div data-testid="bug-dialog" /> : null,
}));

import BugReportProvider, { useBugReport } from './BugReportProvider';

function Consumer() {
  const { open } = useBugReport();
  return (
    <button type="button" onClick={open}>
      open-bug-report
    </button>
  );
}

describe('BugReportProvider', () => {
  it('opens the dialog when the consumer calls open()', () => {
    render(
      <BugReportProvider>
        <Consumer />
      </BugReportProvider>,
    );

    // Initially closed.
    expect(screen.queryByTestId('bug-dialog')).not.toBeInTheDocument();

    fireEvent.click(screen.getByText('open-bug-report'));
    expect(screen.getByTestId('bug-dialog')).toBeInTheDocument();
  });

  it('provides a noop default outside of the provider', () => {
    // Rendering the consumer outside a provider should not throw.
    render(<Consumer />);
    expect(() =>
      fireEvent.click(screen.getByText('open-bug-report')),
    ).not.toThrow();
  });
});
