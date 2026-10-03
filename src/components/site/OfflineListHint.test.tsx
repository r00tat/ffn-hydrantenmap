// @vitest-environment jsdom
import { screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithIntl } from '../../test-utils/intlRender';

const mocks = vi.hoisted(() => ({ status: 'offline' as string }));

vi.mock('../../hooks/useConnectivity', () => ({
  default: () => ({ status: mocks.status }),
}));

import OfflineListHint from './OfflineListHint';

beforeEach(() => {
  mocks.status = 'offline';
});

describe('OfflineListHint', () => {
  it('kennzeichnet eine leere Liste aus dem Cache offline', () => {
    renderWithIntl(<OfflineListHint fromCache empty />);
    expect(
      screen.getByText(/Offline – keine Einträge auf diesem Gerät/),
    ).toBeInTheDocument();
  });

  it('kennzeichnet eine gefüllte Liste aus dem Cache offline knapp', () => {
    renderWithIntl(<OfflineListHint fromCache empty={false} />);
    expect(
      screen.getByText('Offline – evtl. unvollständig'),
    ).toBeInTheDocument();
  });

  it('zeigt online nichts, auch wenn der erste Stand aus dem Cache kommt', () => {
    mocks.status = 'online';
    const { container } = renderWithIntl(<OfflineListHint fromCache empty />);
    expect(container).toBeEmptyDOMElement();
  });

  it('zeigt nichts, wenn die Liste vom Server stammt', () => {
    const { container } = renderWithIntl(
      <OfflineListHint fromCache={false} empty />,
    );
    expect(container).toBeEmptyDOMElement();
  });
});
