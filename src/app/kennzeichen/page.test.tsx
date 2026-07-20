// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { renderWithIntl } from '../../test-utils/intlRender';

vi.mock('./configActions', () => ({
  getGroupsWithOebfvConfig: vi.fn(async () => []),
  hasOebfvConfig: vi.fn(async () => false),
}));
vi.mock('./queryActions', () => ({
  queryKennzeichen: vi.fn(),
}));
vi.mock('../../hooks/useFirecall', () => ({
  __esModule: true,
  default: () => undefined,
}));

import KennzeichenPage from './page';

describe('KennzeichenPage', () => {
  beforeEach(() => vi.clearAllMocks());

  it('shows the no-config hint when no group has a token', async () => {
    renderWithIntl(<KennzeichenPage />);
    await waitFor(() =>
      expect(
        screen.getByText(/kein Token konfiguriert/i)
      ).toBeInTheDocument()
    );
  });
});
