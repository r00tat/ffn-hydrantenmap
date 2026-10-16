// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { renderWithIntl as render } from '../../test-utils/intlRender';

vi.mock('firebase/firestore', () => ({ where: vi.fn() }));
vi.mock('../../hooks/useFirecall', () => ({ useFirecallId: () => 'fc1' }));
const historyPath: string[] = [];
vi.mock('../../hooks/useMapEditor', () => ({
  useHistoryPathSegments: () => historyPath,
}));
const collectionMock = vi.fn();
vi.mock('../../hooks/useFirebaseCollection', () => ({
  default: ({ pathSegments }: { pathSegments: string[] }) =>
    collectionMock(pathSegments) ??
    (pathSegments.at(-1) === 'layer'
      ? [{ id: 'l1', type: 'layer', name: 'Abschnitt Nord', deleted: true }]
      : [
          { id: 'm1', type: 'marker', name: 'Gefahrenstelle', deleted: true },
          { id: 'm2', type: 'marker', name: 'Sammelplatz', deleted: true },
        ]),
}));
vi.mock('../FirecallItems/FirecallItemCard', () => ({
  default: ({ item }: { item: { name: string } }) => <div>{item.name}</div>,
}));

const { default: DeletedItemsSection } = await import('./DeletedItemsSection');

describe('DeletedItemsSection', () => {
  it('zeigt im Kopf die Zahl der gelöschten Ebenen und Elemente', () => {
    render(<DeletedItemsSection />);
    expect(screen.getByText('Gelöschte Elemente (3)')).toBeInTheDocument();
  });

  it('listet nach dem Aufklappen Ebenen vor Elementen', async () => {
    render(<DeletedItemsSection />);
    await userEvent.click(screen.getByText('Gelöschte Elemente (3)'));

    const names = ['Abschnitt Nord', 'Gefahrenstelle', 'Sammelplatz'].map((n) =>
      screen.getByText(n),
    );
    expect(
      names[0].compareDocumentPosition(names[1]) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it('liest im Verlauf die gelöschten Elemente des Snapshots', () => {
    historyPath.push('history', 'h1');
    render(<DeletedItemsSection />);
    expect(collectionMock).toHaveBeenCalledWith(['fc1', 'history', 'h1', 'item']);
    historyPath.length = 0;
  });
});
