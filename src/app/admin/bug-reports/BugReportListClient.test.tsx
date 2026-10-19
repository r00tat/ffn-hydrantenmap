// @vitest-environment jsdom
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithIntl } from '../../../test-utils/intlRender';

vi.mock('./bugReportAdminActions', () => ({
  listBugReportsAction: vi.fn(async () => []),
}));
vi.mock('./BugReportConfigSection', () => ({ default: () => null }));
vi.mock('./BugReportDetailDialog', () => ({
  default: ({ reportId, onClose }: { reportId: string; onClose: () => void }) => (
    <div data-testid="detail">
      {reportId}
      <button onClick={onClose}>schließen</button>
    </div>
  ),
}));
vi.mock('../../../components/providers/SnackbarProvider', () => ({
  useSnackbar: () => vi.fn(),
}));

import BugReportListClient from './BugReportListClient';

const config = { recipients: [] } as never;

describe('BugReportListClient Direkt-Link', () => {
  it('öffnet ohne Vorauswahl keinen Report', () => {
    renderWithIntl(<BugReportListClient initialReports={[]} initialConfig={config} />);
    expect(screen.queryByTestId('detail')).toBeNull();
  });

  it('öffnet den Report aus dem Direkt-Link und kehrt beim Schließen zur Liste zurück', async () => {
    window.history.replaceState(null, '', '/admin/bug-reports/r1');
    renderWithIntl(
      <BugReportListClient
        initialReports={[]}
        initialConfig={config}
        initialSelectedId="r1"
      />,
    );
    expect(screen.getByTestId('detail')).toHaveTextContent('r1');

    await userEvent.setup().click(screen.getByText('schließen'));
    expect(screen.queryByTestId('detail')).toBeNull();
    expect(window.location.pathname).toBe('/admin/bug-reports');
  });
});
