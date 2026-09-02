// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PositionInfo } from '../../hooks/usePosition';
import type { LiveLocationContextValue } from '../providers/LiveLocationProvider';

const liveLocationState = {
  isSharing: false,
};
vi.mock('../providers/LiveLocationProvider', () => ({
  useLiveLocationContext: (): LiveLocationContextValue => ({
    isSharing: liveLocationState.isSharing,
    settings: { heartbeatMs: 30_000, distanceM: 20 },
    setSettings: () => {},
    start: async () => {},
    stop: async () => {},
    canShare: true,
  }),
}));

const positionState = { isPositionSet: true };
vi.mock('../providers/PositionProvider', () => ({
  usePositionContext: (): PositionInfo => [
    { lat: 47.9, lng: 16.85 },
    positionState.isPositionSet,
    undefined,
    () => {},
    false,
  ],
}));

vi.mock('../../hooks/useFirecall', () => ({
  useFirecall: () => ({ id: 'fc-A', name: 'Brand B7' }),
}));

import LiveLocationFab from './LiveLocationFab';

describe('LiveLocationFab', () => {
  beforeEach(() => {
    liveLocationState.isSharing = false;
    positionState.isPositionSet = true;
  });

  // #760: Eine schlichte Kartennadel liest sich wie „meine Position". Der
  // Knopf teilt den Standort aber mit den anderen Einsatzkräften — dafür
  // steht das Sende-Symbol.
  it('uses a share-location icon while not sharing', () => {
    render(<LiveLocationFab />);
    expect(screen.getByTestId('ShareLocationOutlinedIcon')).toBeTruthy();
    expect(
      screen.getByRole('button', { name: 'Live-Standort teilen' }),
    ).toBeTruthy();
  });

  it('uses the filled share-location icon while sharing', () => {
    liveLocationState.isSharing = true;
    render(<LiveLocationFab />);
    expect(screen.getByTestId('ShareLocationIcon')).toBeTruthy();
    expect(
      screen.getByRole('button', { name: 'Live-Standort teilen beenden' }),
    ).toBeTruthy();
  });
});
