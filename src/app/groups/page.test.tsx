// @vitest-environment jsdom
import { screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { renderWithIntl } from '../../test-utils/intlRender';

const { groupsMock } = vi.hoisted(() => ({ groupsMock: vi.fn() }));

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock('../../components/site/AdminGuard', () => ({
  default: ({ children }: { children: React.ReactNode }) => children,
}));
vi.mock('../../components/groups/useGroupEditor', () => ({
  default: () => ({ edit: vi.fn(), dialog: null }),
}));
vi.mock('../../components/providers/SnackbarProvider', () => ({
  useSnackbar: () => vi.fn(),
}));
vi.mock('../users/action', () => ({ getUsers: async () => [] }));
vi.mock('./GroupAction', () => ({
  getGroupsAction: () => groupsMock(),
  createKnownGroupsAction: vi.fn(),
  deleteGroupAction: vi.fn(),
  setGroupParentAction: vi.fn(),
}));

import GroupsPage from './page';

describe('GroupsPage', () => {
  it('zeigt beim Laden einen Ladeindikator statt „Standardgruppen anlegen“', () => {
    groupsMock.mockReturnValue(new Promise(() => {}));
    renderWithIntl(<GroupsPage />);

    expect(
      screen.getByRole('progressbar', { name: 'Gruppen werden geladen' })
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /anlegen/i })).toBeNull();
  });

  it('zeigt nach dem Laden die Gruppen', async () => {
    groupsMock.mockResolvedValue([
      { id: 'ffnd', name: 'FF Neusiedl' },
      { id: 'allUsers', name: 'Alle Benutzer' },
    ]);
    renderWithIntl(<GroupsPage />);

    expect(await screen.findByText('FF Neusiedl')).toBeInTheDocument();
    expect(screen.queryByRole('progressbar')).toBeNull();
  });
});
