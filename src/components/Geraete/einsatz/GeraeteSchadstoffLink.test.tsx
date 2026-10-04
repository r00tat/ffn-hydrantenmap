// @vitest-environment jsdom
import { screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { renderWithIntl as render } from '../../../test-utils/intlRender';

const state = vi.hoisted(() => ({ firecallId: 'fc1' }));
vi.mock('../../../hooks/useFirecall', () => ({ useFirecallId: () => state.firecallId }));
vi.mock('next/navigation', () => ({ usePathname: () => '/einsatz/fc1/schadstoff/datenbank' }));

import GeraeteSchadstoffLink from './GeraeteSchadstoffLink';

describe('GeraeteSchadstoffLink', () => {
  it('verweist auf den Abschnitt Geräte des Einsatzes', () => {
    state.firecallId = 'fc1';
    render(<GeraeteSchadstoffLink />);
    expect(
      screen.getByRole('link', { name: 'Verbrauchtes Material erfassen' }),
    ).toHaveAttribute('href', '/einsatz/fc1/geraete');
  });

  it('ohne Einsatz kein Verweis', () => {
    state.firecallId = 'unknown';
    render(<GeraeteSchadstoffLink />);
    expect(screen.queryByRole('link')).toBeNull();
  });
});
