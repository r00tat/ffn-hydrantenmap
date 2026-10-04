// @vitest-environment jsdom
import { render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  pathname: '/einsatz/AAAAAAAAAAAAAAAAAAAA',
  params: { firecallId: 'AAAAAAAAAAAAAAAAAAAA' },
  setFirecallId: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  usePathname: () => mocks.pathname,
  useParams: () => mocks.params,
}));
vi.mock('../../../hooks/useFirecall', () => ({
  useFirecallSelect: () => mocks.setFirecallId,
}));

import EinsatzClient from './EinsatzClient';

beforeEach(() => {
  mocks.pathname = '/einsatz/AAAAAAAAAAAAAAAAAAAA';
  mocks.params = { firecallId: 'AAAAAAAAAAAAAAAAAAAA' };
  mocks.setFirecallId.mockReset();
});

describe('EinsatzClient', () => {
  it('folgt der Adresse, auch wenn der Router-Parameter stehen bleibt', () => {
    // Nach einem Wechsel per pushState meldet useParams weiter den alten
    // Einsatz; maßgeblich ist die Adresse.
    const { rerender } = render(<EinsatzClient>x</EinsatzClient>);
    expect(mocks.setFirecallId).toHaveBeenLastCalledWith('AAAAAAAAAAAAAAAAAAAA');

    mocks.pathname = '/einsatz/BBBBBBBBBBBBBBBBBBBB/tagebuch';
    rerender(<EinsatzClient>x</EinsatzClient>);
    expect(mocks.setFirecallId).toHaveBeenLastCalledWith('BBBBBBBBBBBBBBBBBBBB');
  });

  it('nimmt auf Seiten mit eigener Route den Router-Parameter', () => {
    mocks.pathname = '/einsatz/AAAAAAAAAAAAAAAAAAAA/kostenersatz/neu';
    render(<EinsatzClient>x</EinsatzClient>);
    expect(mocks.setFirecallId).toHaveBeenLastCalledWith('AAAAAAAAAAAAAAAAAAAA');
  });
});
