// @vitest-environment jsdom
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithIntl } from '../../test-utils/intlRender';
import { jacke, makeArtikel, polo, sampleView } from './bekleidungFixtures';

const { saveArtikel, mergeArtikel } = vi.hoisted(() => ({
  saveArtikel: vi.fn(),
  mergeArtikel: vi.fn(),
}));
vi.mock('./bekleidungActions', () => ({
  saveArtikel,
  mergeArtikel,
  previewBekleidungImport: vi.fn(),
  importBekleidung: vi.fn(),
}));
vi.mock('../../hooks/useOnline', () => ({ default: () => true }));

import ArtikelTab from './ArtikelTab';

describe('ArtikelTab', () => {
  beforeEach(() => vi.clearAllMocks());

  it('legt einen Artikel an', async () => {
    saveArtikel.mockResolvedValue({ id: 'neu' });
    const user = userEvent.setup();
    renderWithIntl(<ArtikelTab view={sampleView()} />);
    expect(screen.getByText('Einsatzjacke')).toBeInTheDocument();
    expect(screen.getByText('Poloshirt')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Artikel anlegen' }));
    await user.type(screen.getByRole('textbox', { name: 'Bezeichnung' }), 'Einsatzhose');
    await user.type(screen.getByRole('spinbutton', { name: 'Max. Waschgänge' }), '25');
    await user.click(screen.getByRole('button', { name: 'Speichern' }));
    expect(saveArtikel).toHaveBeenCalledWith('ffnd', undefined, {
      kategorie: 'einsatz',
      bezeichnung: 'Einsatzhose',
      hersteller: undefined,
      fuehrung: 'einzeln',
      maxWaschgaenge: 25,
      aktiv: true,
    });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('zeigt, wenn sich die Führung nicht mehr ändern lässt', async () => {
    saveArtikel.mockResolvedValue({ success: false, error: 'fuehrungLocked' });
    const user = userEvent.setup();
    renderWithIntl(<ArtikelTab view={sampleView()} />);
    await user.click(screen.getByText('Einsatzjacke'));
    await user.click(screen.getByRole('combobox', { name: 'Führung' }));
    await user.click(screen.getByRole('option', { name: 'Menge' }));
    await user.click(screen.getByRole('button', { name: 'Speichern' }));
    expect(await screen.findByText(/Die Führung lässt sich nicht mehr ändern/)).toBeInTheDocument();
    expect(saveArtikel).toHaveBeenCalledWith(
      'ffnd',
      'jacke',
      expect.objectContaining({ fuehrung: 'menge' }),
    );
  });

  it('führt einen Artikel in einen gleichartigen zusammen', async () => {
    mergeArtikel.mockResolvedValue({ success: true });
    const user = userEvent.setup();
    const polo2 = makeArtikel({
      id: 'polo2',
      kategorie: 'dienst',
      bezeichnung: 'Poloshirt',
      hersteller: 'Fa X',
      fuehrung: 'menge',
    });
    renderWithIntl(<ArtikelTab view={sampleView({ artikel: [jacke, polo, polo2] })} />);

    // Die Jacke hat keinen gleichartigen Artikel — nichts zum Zusammenführen.
    expect(screen.queryByRole('button', { name: 'Zusammenführen Einsatzjacke' })).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Zusammenführen Poloshirt (Fa X)' }));
    await user.click(screen.getByRole('combobox', { name: 'Zusammenführen in' }));
    await user.click(screen.getByRole('option', { name: 'Poloshirt' }));
    await user.click(screen.getByRole('button', { name: 'Zusammenführen' }));
    expect(mergeArtikel).toHaveBeenCalledWith('ffnd', 'polo', ['polo2']);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
