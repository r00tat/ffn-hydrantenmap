// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithIntl } from '../../test-utils/intlRender';

vi.mock('./rescueActions', () => ({
  searchRescueSheetsAction: vi.fn(),
  loadRescueMakesAction: vi.fn(),
}));

import RettungskartenPage from './page';
import { loadRescueMakesAction, searchRescueSheetsAction } from './rescueActions';

const sheet = {
  id: '1',
  makeName: 'Audi',
  modelName: 'A3',
  variantName: 'A3 Sportback',
  bodyType: 'Hatchback',
  buildYearFrom: 2012,
  buildYearUntil: 2020,
  sheetUrl: 'https://example.test/a3_DE.pdf',
  sheetLanguage: 'DE',
};

describe('RettungskartenPage', () => {
  beforeEach(() => {
    vi.mocked(loadRescueMakesAction).mockResolvedValue({
      makes: ['Audi', 'Tesla'],
    });
    vi.mocked(searchRescueSheetsAction).mockResolvedValue({ sheets: [sheet] });
  });

  it('offers the makes as an entry point', async () => {
    renderWithIntl(<RettungskartenPage />);

    expect(await screen.findByText('Audi')).toBeInTheDocument();
    expect(screen.getByText('Tesla')).toBeInTheDocument();
  });

  it('searches after typing and lists the results', async () => {
    const user = userEvent.setup();
    renderWithIntl(<RettungskartenPage />);

    await user.type(screen.getByLabelText('Fahrzeug suchen'), 'audi a3');

    await waitFor(() =>
      expect(searchRescueSheetsAction).toHaveBeenCalledWith('audi a3'),
    );
    expect(await screen.findByText('Audi A3 Sportback')).toBeInTheDocument();
    expect(screen.getByText('1 Fahrzeug gefunden')).toBeInTheDocument();
  });

  it('starts a search when a make is clicked', async () => {
    const user = userEvent.setup();
    renderWithIntl(<RettungskartenPage />);

    await user.click(await screen.findByText('Tesla'));

    await waitFor(() =>
      expect(searchRescueSheetsAction).toHaveBeenCalledWith('Tesla'),
    );
  });

  it('reports an empty result', async () => {
    vi.mocked(searchRescueSheetsAction).mockResolvedValue({ sheets: [] });
    const user = userEvent.setup();
    renderWithIntl(<RettungskartenPage />);

    await user.type(screen.getByLabelText('Fahrzeug suchen'), 'steyr');

    expect(
      await screen.findByText(/Kein Fahrzeug im Euro-Rescue-Katalog/),
    ).toBeInTheDocument();
  });

  it('warns when the catalog is unavailable', async () => {
    vi.mocked(searchRescueSheetsAction).mockResolvedValue({
      sheets: [],
      error: 'upstream',
    });
    const user = userEvent.setup();
    renderWithIntl(<RettungskartenPage />);

    await user.type(screen.getByLabelText('Fahrzeug suchen'), 'audi');

    expect(
      await screen.findByText(/nicht erreichbar/),
    ).toBeInTheDocument();
  });
});
