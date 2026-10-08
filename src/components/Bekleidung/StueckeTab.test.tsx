// @vitest-environment jsdom
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { renderWithIntl } from '../../test-utils/intlRender';
import { sampleView } from './bekleidungFixtures';

vi.mock('./bekleidungActions', () => ({
  setStueckStatus: vi.fn(),
  createStuecke: vi.fn(),
  updateStueck: vi.fn(),
}));
vi.mock('../../hooks/useOnline', () => ({ default: () => true }));
vi.mock('../../hooks/useBarcodeScanner', () => ({
  default: () => ({ videoRef: { current: null }, status: 'unsupported', frames: 0 }),
}));

import StueckeTab, { EMPTY_STUECK_FILTER, filterStuecke } from './StueckeTab';

describe('filterStuecke', () => {
  it('filtert nach Status, Person und Tag-Nummer', () => {
    const view = sampleView();
    const ids = (patch: Partial<typeof EMPTY_STUECK_FILTER>) =>
      filterStuecke(view, { ...EMPTY_STUECK_FILTER, ...patch }).map((s) => s.id);
    expect(ids({})).toEqual(['s1', 's2', 's3']);
    expect(ids({ status: 'ausgegeben' })).toEqual(['s2']);
    expect(ids({ personId: 'p1' })).toEqual(['s2']);
    expect(ids({ search: '1003' })).toEqual(['s3']);
    expect(ids({ groesse: 'XL' })).toEqual(['s3']);
    expect(ids({ kategorie: 'dienst' })).toEqual([]);
  });
});

describe('StueckeTab', () => {
  it('zeigt die Stücke und öffnet nach dem Scan das Detail', async () => {
    const user = userEvent.setup();
    renderWithIntl(<StueckeTab view={sampleView()} />);
    expect(screen.getByText('1001')).toBeInTheDocument();
    expect(screen.getByText('privat')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Scannen' }));
    await user.type(
      screen.getByRole('textbox', { name: 'Tag-Nummer von Hand eingeben' }),
      '1002{Enter}',
    );
    expect(screen.getByRole('dialog', { name: 'Einsatzjacke · M · #1002' })).toBeInTheDocument();
  });
});
