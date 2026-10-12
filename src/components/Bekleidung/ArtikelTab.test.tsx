// @vitest-environment jsdom
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithIntl } from '../../test-utils/intlRender';
import { jacke, makeArtikel, polo, sampleView } from './bekleidungFixtures';

const { saveArtikel, mergeArtikel, convertArtikelToMenge } = vi.hoisted(() => ({
  saveArtikel: vi.fn(),
  mergeArtikel: vi.fn(),
  convertArtikelToMenge: vi.fn(),
}));
vi.mock('./bekleidungActions', () => ({
  saveArtikel,
  mergeArtikel,
  convertArtikelToMenge,
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
    // Der Hersteller der Variante wird standardmäßig zur Charge.
    const asCharge = screen.getByRole('checkbox', { name: 'Hersteller als Charge übernehmen' });
    expect(asCharge).toBeChecked();
    await user.click(screen.getByRole('button', { name: 'Zusammenführen' }));
    expect(mergeArtikel).toHaveBeenCalledWith('ffnd', 'polo', ['polo2'], {
      chargeFromHersteller: true,
    });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('stellt einen Einzelartikel nach Bestätigung auf Menge um', async () => {
    convertArtikelToMenge.mockResolvedValue({ bestand: 1, ausgaben: 1, entfallen: 1 });
    const user = userEvent.setup();
    const view = sampleView();
    for (const st of view.stuecke) st.waschgaenge = 0;
    renderWithIntl(<ArtikelTab view={view} />);

    // Mengenartikel lassen sich nicht umstellen.
    expect(screen.queryByRole('button', { name: 'Als Menge führen Poloshirt' })).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Als Menge führen Einsatzjacke' }));
    // s1 im Lager → Bestand, s2 mit Ausgabe → Mengen-Ausgabe, s3 privat → entfällt
    expect(screen.getByText('1 Stück im Lager wird Bestand.')).toBeInTheDocument();
    expect(
      screen.getByText('2 Ausgaben bleiben als Mengen-Ausgaben erhalten.'),
    ).toBeInTheDocument();
    expect(
      screen.getByText('1 Stück entfällt (privat, ausgeschieden oder ohne Person).'),
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Als Menge führen' }));
    expect(convertArtikelToMenge).toHaveBeenCalledWith('ffnd', 'jacke');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('sperrt die Umstellung, solange Wäschen in der App erfasst sind', async () => {
    const user = userEvent.setup();
    renderWithIntl(<ArtikelTab view={sampleView()} />);
    await user.click(screen.getByRole('button', { name: 'Als Menge führen Einsatzjacke' }));
    expect(
      screen.getByText(/In der App erfasste Wäschen hängen an den Stücken/),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Als Menge führen' })).toBeDisabled();
  });
});
