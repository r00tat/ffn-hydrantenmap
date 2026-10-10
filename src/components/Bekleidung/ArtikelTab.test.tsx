// @vitest-environment jsdom
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithIntl } from '../../test-utils/intlRender';
import { sampleView } from './bekleidungFixtures';

const { saveArtikel } = vi.hoisted(() => ({ saveArtikel: vi.fn() }));
vi.mock('./bekleidungActions', () => ({
  saveArtikel,
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
    expect(
      await screen.findByText(/Die Führung lässt sich nicht mehr ändern/),
    ).toBeInTheDocument();
    expect(saveArtikel).toHaveBeenCalledWith('ffnd', 'jacke', expect.objectContaining({ fuehrung: 'menge' }));
  });
});
