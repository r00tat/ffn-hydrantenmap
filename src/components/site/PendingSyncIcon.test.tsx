// @vitest-environment jsdom
import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderWithIntl } from '../../test-utils/intlRender';
import PendingSyncIcon from './PendingSyncIcon';

describe('PendingSyncIcon', () => {
  it('kennzeichnet einen noch nicht übertragenen Eintrag', () => {
    renderWithIntl(<PendingSyncIcon />);
    expect(
      screen.getByRole('img', {
        name: 'Noch nicht übertragen – liegt erst auf diesem Gerät',
      }),
    ).toBeInTheDocument();
  });
});
