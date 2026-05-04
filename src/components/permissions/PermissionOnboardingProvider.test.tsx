// @vitest-environment jsdom
import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: vi.fn() },
}));
vi.mock('@capacitor/preferences', () => ({
  Preferences: {
    get: vi.fn(),
    set: vi.fn(),
  },
}));
vi.mock('./PermissionOnboardingWizard', () => ({
  default: () => <div>WIZARD</div>,
}));

import { Capacitor } from '@capacitor/core';
import { Preferences } from '@capacitor/preferences';
import PermissionOnboardingProvider from './PermissionOnboardingProvider';

const isNative = Capacitor.isNativePlatform as unknown as ReturnType<typeof vi.fn>;
const prefsGet = Preferences.get as unknown as ReturnType<typeof vi.fn>;

describe('PermissionOnboardingProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('on web: renders children, no wizard', async () => {
    isNative.mockReturnValue(false);
    render(
      <PermissionOnboardingProvider>
        <div>APP</div>
      </PermissionOnboardingProvider>
    );
    await waitFor(() => expect(screen.getByText('APP')).toBeInTheDocument());
    expect(screen.queryByText('WIZARD')).toBeNull();
  });

  it('native + flag set: renders children', async () => {
    isNative.mockReturnValue(true);
    prefsGet.mockResolvedValue({ value: '1' });
    render(
      <PermissionOnboardingProvider>
        <div>APP</div>
      </PermissionOnboardingProvider>
    );
    await waitFor(() => expect(screen.getByText('APP')).toBeInTheDocument());
  });

  it('native + flag not set: renders wizard', async () => {
    isNative.mockReturnValue(true);
    prefsGet.mockResolvedValue({ value: null });
    render(
      <PermissionOnboardingProvider>
        <div>APP</div>
      </PermissionOnboardingProvider>
    );
    await waitFor(() => expect(screen.getByText('WIZARD')).toBeInTheDocument());
  });
});
