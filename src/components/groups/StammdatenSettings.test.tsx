// @vitest-environment jsdom
import { screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_GROUP_STAMMDATEN } from '../../common/groupStammdaten';
import { renderWithIntl } from '../../test-utils/intlRender';

vi.mock('../../hooks/useGroupStammdaten', () => ({
  default: () => ({
    ...DEFAULT_GROUP_STAMMDATEN,
    absenderName: 'FF Musterdorf',
    iban: 'AT40 3300 0000 0202 0402',
  }),
}));

// Der Upload zieht beim Import `getStorage(app)` nach und damit die
// Firebase-Initialisierung, die es im Test nicht gibt.
vi.mock('./uploadStammdatenLogo', () => ({
  uploadStammdatenLogo: vi.fn().mockResolvedValue({}),
}));

vi.mock('../../app/groups/stammdatenActions', () => ({
  saveGroupStammdaten: vi.fn(),
  signStammdatenLogo: vi.fn().mockResolvedValue({}),
}));

const StammdatenSettings = (await import('./StammdatenSettings')).default;

describe('StammdatenSettings', () => {
  it('zeigt die gepflegten Werte in den Feldern', async () => {
    renderWithIntl(<StammdatenSettings groupId="ffnd" />);
    expect(await screen.findByDisplayValue('FF Musterdorf')).toBeInTheDocument();
    expect(screen.getByDisplayValue('AT40 3300 0000 0202 0402')).toBeInTheDocument();
  });

  it('meldet, dass kein Logo hinterlegt ist', async () => {
    renderWithIntl(<StammdatenSettings groupId="ffnd" />);
    expect(await screen.findByText(/Kein Logo hinterlegt/)).toBeInTheDocument();
  });
});
