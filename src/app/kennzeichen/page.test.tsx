// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithIntl } from '../../test-utils/intlRender';
import type {
  Diary,
  FirecallItem,
} from '../../components/firebase/firestore';

vi.mock('./configActions', () => ({
  getGroupsWithOebfvConfig: vi.fn(async () => []),
  hasOebfvConfig: vi.fn(async () => false),
}));
vi.mock('./queryActions', () => ({
  queryKennzeichen: vi.fn(),
}));

const firecallId = { current: 'firecall1' };
vi.mock('../../hooks/useFirecall', () => ({
  __esModule: true,
  default: () => undefined,
  useFirecallId: () => firecallId.current,
}));

const addFirecallItem = vi.fn(async (item: FirecallItem) => item);
vi.mock('../../hooks/useFirecallItemAdd', () => ({
  __esModule: true,
  default: () => addFirecallItem,
}));

import KennzeichenPage from './page';
import { getGroupsWithOebfvConfig } from './configActions';
import { queryKennzeichen } from './queryActions';

const vehicle = {
  antrieb: 'Diesel',
  marke: 'VW',
  name: 'Golf',
  type: 'Golf VII',
  hoechstMasse: '1900 kg',
  erstzulassung: '12.03.2019',
  fin: 'WVWZZZ1KZAW000001',
  variante: 'AM',
  version: 'A1',
};

async function search() {
  const user = userEvent.setup();
  await screen.findByLabelText('Behörde');
  await user.type(screen.getByLabelText('Behörde'), 'W');
  await user.type(screen.getByLabelText('Vormerkzeichen'), '12345');
  await user.click(screen.getByRole('button', { name: 'Suchen' }));
}

describe('KennzeichenPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    firecallId.current = 'firecall1';
    vi.mocked(getGroupsWithOebfvConfig).mockResolvedValue([]);
  });

  it('shows the no-config hint when no group has a token', async () => {
    renderWithIntl(<KennzeichenPage />);
    await waitFor(() =>
      expect(
        screen.getByText(/kein Token konfiguriert/i)
      ).toBeInTheDocument()
    );
  });

  it('writes a diary entry after a successful query', async () => {
    vi.mocked(getGroupsWithOebfvConfig).mockResolvedValue(['ffnd']);
    vi.mocked(queryKennzeichen).mockResolvedValue({
      vehicles: [vehicle],
      rescueSheets: [],
      noResult: false,
      system: 'einsatz',
    });

    renderWithIntl(<KennzeichenPage />);
    await search();

    await waitFor(() => expect(addFirecallItem).toHaveBeenCalledTimes(1));
    const entry = addFirecallItem.mock.calls[0][0] as Diary;
    expect(entry.type).toBe('diary');
    expect(entry.name).toBe('Kennzeichenabfrage W 12345');
    expect(entry.beschreibung).toContain('Marke: VW');
    expect(
      await screen.findByText(/ins Einsatztagebuch eingetragen/i)
    ).toBeInTheDocument();
  });

  it('writes a diary entry when nothing was found', async () => {
    vi.mocked(getGroupsWithOebfvConfig).mockResolvedValue(['ffnd']);
    vi.mocked(queryKennzeichen).mockResolvedValue({
      vehicles: [],
      rescueSheets: [],
      noResult: true,
      system: 'einsatz',
    });

    renderWithIntl(<KennzeichenPage />);
    await search();

    await waitFor(() => expect(addFirecallItem).toHaveBeenCalledTimes(1));
    const entry = addFirecallItem.mock.calls[0][0] as Diary;
    expect(entry.beschreibung).toBe('Keine Zulassung gefunden.');
  });

  it('shows the matching rescue sheet with the result', async () => {
    vi.mocked(getGroupsWithOebfvConfig).mockResolvedValue(['ffnd']);
    vi.mocked(queryKennzeichen).mockResolvedValue({
      vehicles: [vehicle],
      rescueSheets: [
        [
          {
            id: '1',
            makeName: 'Volkswagen',
            modelName: 'Golf',
            variantName: 'Golf',
            buildYearFrom: 2019,
            sheetUrl: 'https://example.test/golf_DE.pdf',
            sheetLanguage: 'DE',
          },
        ],
      ],
      noResult: false,
      system: 'einsatz',
    });

    renderWithIntl(<KennzeichenPage />);
    await search();

    const link = await screen.findByRole('link', {
      name: /Rettungskarte \(DE\)/,
    });
    expect(link).toHaveAttribute('href', 'https://example.test/golf_DE.pdf');
    expect(link).toHaveAttribute('target', '_blank');
  });

  it('writes the rescue sheet link into the diary entry', async () => {
    vi.mocked(getGroupsWithOebfvConfig).mockResolvedValue(['ffnd']);
    vi.mocked(queryKennzeichen).mockResolvedValue({
      vehicles: [vehicle],
      rescueSheets: [
        [
          {
            id: '1',
            makeName: 'Volkswagen',
            modelName: 'Golf',
            variantName: 'Golf',
            buildYearFrom: 2019,
            sheetUrl: 'https://example.test/golf_DE.pdf',
            sheetLanguage: 'DE',
          },
        ],
      ],
      noResult: false,
      system: 'einsatz',
    });

    renderWithIntl(<KennzeichenPage />);
    await search();

    await waitFor(() => expect(addFirecallItem).toHaveBeenCalledTimes(1));
    const entry = addFirecallItem.mock.calls[0][0] as Diary;
    expect(entry.beschreibung).toContain(
      'Rettungskarte: Volkswagen Golf (2019–): https://example.test/golf_DE.pdf',
    );
  });

  it('does not write a diary entry when the query failed', async () => {
    vi.mocked(getGroupsWithOebfvConfig).mockResolvedValue(['ffnd']);
    vi.mocked(queryKennzeichen).mockResolvedValue({
      vehicles: [],
      rescueSheets: [],
      noResult: true,
      system: 'einsatz',
      error: 'upstream',
    });

    renderWithIntl(<KennzeichenPage />);
    await search();

    await screen.findByText(/Abfrage ist fehlgeschlagen/i);
    expect(addFirecallItem).not.toHaveBeenCalled();
  });

  it('shows a hint instead of writing when no firecall is active', async () => {
    firecallId.current = 'unknown';
    vi.mocked(getGroupsWithOebfvConfig).mockResolvedValue(['ffnd']);
    vi.mocked(queryKennzeichen).mockResolvedValue({
      vehicles: [vehicle],
      rescueSheets: [],
      noResult: false,
      system: 'einsatz',
    });

    renderWithIntl(<KennzeichenPage />);
    await search();

    expect(
      await screen.findByText(/Kein Einsatz ausgewählt/i)
    ).toBeInTheDocument();
    expect(addFirecallItem).not.toHaveBeenCalled();
  });
});
