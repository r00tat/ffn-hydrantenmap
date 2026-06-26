// @vitest-environment jsdom
import { act, screen, waitForElementToBeRemoved } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { renderWithIntl } from '../../test-utils/intlRender';
import deMessages from '../../../messages/de.json';
import OfflineWarning from './OfflineWarning';

function setNavigatorOnLine(value: boolean) {
  Object.defineProperty(window.navigator, 'onLine', {
    configurable: true,
    value,
  });
}

describe('OfflineWarning', () => {
  beforeEach(() => {
    setNavigatorOnLine(true);
  });

  afterEach(() => {
    setNavigatorOnLine(true);
  });

  it('renders nothing visible while online', () => {
    renderWithIntl(<OfflineWarning />);
    expect(
      screen.queryByText(deMessages.networkStatus.offline),
    ).not.toBeInTheDocument();
  });

  it('shows the offline warning while offline', () => {
    setNavigatorOnLine(false);
    renderWithIntl(<OfflineWarning />);
    expect(
      screen.getByText(deMessages.networkStatus.offline),
    ).toBeInTheDocument();
    expect(
      screen.getByText(deMessages.networkStatus.offlineTitle),
    ).toBeInTheDocument();
  });

  it('appears when the connection is lost and hides when restored', async () => {
    renderWithIntl(<OfflineWarning />);
    expect(
      screen.queryByText(deMessages.networkStatus.offline),
    ).not.toBeInTheDocument();

    act(() => {
      setNavigatorOnLine(false);
      window.dispatchEvent(new Event('offline'));
    });
    expect(
      screen.getByText(deMessages.networkStatus.offline),
    ).toBeInTheDocument();

    act(() => {
      setNavigatorOnLine(true);
      window.dispatchEvent(new Event('online'));
    });
    await waitForElementToBeRemoved(() =>
      screen.queryByText(deMessages.networkStatus.offline),
    );
  });
});
