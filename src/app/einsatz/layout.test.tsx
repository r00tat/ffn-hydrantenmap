// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { useEffect } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ mounts: 0, notFound: vi.fn() }));

vi.mock('next/navigation', () => ({
  notFound: () => {
    mocks.notFound();
    throw new Error('NEXT_NOT_FOUND');
  },
}));
vi.mock('../../components/pages/FirecallView', () => ({
  default: function FirecallViewStub() {
    useEffect(() => {
      mocks.mounts += 1;
    }, []);
    return <div>Einsatzansicht</div>;
  },
}));

import EinsatzLayout from './layout';
import EinsatzPage from './[firecallId]/page';
import EinsatzSectionPage from './[firecallId]/[section]/page';

beforeEach(() => {
  mocks.mounts = 0;
  mocks.notFound.mockReset();
});

describe('Einsatz-Layout', () => {
  it('behält die Einsatzansicht, wenn Next.js das Seitensegment austauscht', () => {
    // Eine Server Action, die Cookies setzt (Auffrischen der Anmeldung),
    // lässt Next.js den Baum der aktuellen Adresse neu rendern. Nach einem
    // Wechsel per pushState ist das ein anderes Seitensegment als beim Laden
    // — die Einsatzansicht darf dabei nicht neu gemountet werden.
    const MapSegment = () => null;
    const SectionSegment = () => null;
    const { rerender } = render(
      <EinsatzLayout>
        <MapSegment />
      </EinsatzLayout>,
    );
    rerender(
      <EinsatzLayout>
        <SectionSegment />
      </EinsatzLayout>,
    );

    expect(screen.getByText('Einsatzansicht')).toBeInTheDocument();
    expect(mocks.mounts).toBe(1);
  });
});

describe('Einsatzseiten', () => {
  it('rendern selbst nichts, die Ansicht kommt aus dem Layout', async () => {
    expect(EinsatzPage()).toBeNull();
    await expect(
      EinsatzSectionPage({
        params: Promise.resolve({ firecallId: 'X', section: 'details' }),
      }),
    ).resolves.toBeNull();
  });

  it('melden einen unbekannten Abschnitt als nicht gefunden', async () => {
    await expect(
      EinsatzSectionPage({
        params: Promise.resolve({ firecallId: 'X', section: 'gibtsnicht' }),
      }),
    ).rejects.toThrow('NEXT_NOT_FOUND');
    expect(mocks.notFound).toHaveBeenCalled();
  });
});
