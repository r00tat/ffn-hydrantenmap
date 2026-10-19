// @vitest-environment jsdom
import { screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithIntl } from '../../test-utils/intlRender';

const firebaseLoginMock = vi.fn();
vi.mock('../../hooks/useFirebaseLogin', () => ({
  default: () => firebaseLoginMock(),
}));

import MemberRolesLink from './MemberRolesLink';

beforeEach(() => vi.clearAllMocks());

describe('MemberRolesLink', () => {
  it('verweist den Gruppen-Admin auf die Rollen-Ansicht der Gruppe', () => {
    firebaseLoginMock.mockReturnValue({
      isAuthorized: true,
      groupRoles: { ffnd: ['gruppenadmin'] },
    });

    renderWithIntl(<MemberRolesLink groupId="ffnd" />);

    expect(screen.getByRole('link')).toHaveAttribute(
      'href',
      '/groups/ffnd',
    );
  });

  it('bleibt ohne rollen.assign unsichtbar', () => {
    // Ein Gerätemeister pflegt das Fahrtenbuch, vergibt aber keine Rollen —
    // ein Verweis auf eine Seite, die ihn abweist, hilft ihm nicht.
    firebaseLoginMock.mockReturnValue({
      isAuthorized: true,
      groupRoles: { ffnd: ['geraetemeister'] },
    });

    const { container } = renderWithIntl(<MemberRolesLink groupId="ffnd" />);

    expect(container).toBeEmptyDOMElement();
  });
});
