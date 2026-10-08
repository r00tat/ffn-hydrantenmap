// @vitest-environment jsdom
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ImportPreview } from '../../common/bekleidungImport';
import { renderWithIntl } from '../../test-utils/intlRender';
import { sampleData } from './bekleidungFixtures';

const { previewBekleidungImport, importBekleidung } = vi.hoisted(() => ({
  previewBekleidungImport: vi.fn(),
  importBekleidung: vi.fn(),
}));
vi.mock('./bekleidungActions', () => ({ previewBekleidungImport, importBekleidung }));
vi.mock('../Geraete/admin/fileToBase64', () => ({ fileToBase64: async () => 'QkFTRTY0' }));
vi.mock('../../hooks/useOnline', () => ({ default: () => true }));

import BekleidungImportDialog from './BekleidungImportDialog';
import { defaultPersonChoices, openPersonChoices } from './ImportPersonsSection';

const XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

const preview: ImportPreview = {
  rows: [],
  artikel: [
    { key: 'einsatz|jacke|', kategorie: 'einsatz', bezeichnung: 'Einsatzjacke', fuehrung: 'einzeln', rowCount: 3 },
    { key: 'dienst|polo|', kategorie: 'dienst', bezeichnung: 'Poloshirt', fuehrung: 'einzeln', rowCount: 2 },
  ],
  persons: [
    { key: 'max mustermann', vorname: 'Max', nachname: 'Mustermann', match: { status: 'matched', personId: 'p1', candidates: ['p1'] } },
    { key: 'erika musterfrau', vorname: 'Erika', nachname: 'Musterfrau', match: { status: 'uncertain', candidates: ['p2', 'p3'] } },
    { key: 'moritz muster', vorname: 'Moritz', nachname: 'Muster', match: { status: 'new', candidates: [] } },
  ],
  duplicateTags: [
    { tagNummer: '1001', rowNumbers: [{ sheet: 'einsatz', rowNumber: 4 }, { sheet: 'einsatz', rowNumber: 9 }] },
  ],
  statusConflicts: [{ sheet: 'dienst', rowNumber: 7, message: 'Status Lager, aber offene Ausgabe' }],
};

const renderDialog = () =>
  renderWithIntl(
    <BekleidungImportDialog open groupId="ffnd" persons={sampleData().persons} onClose={vi.fn()} />,
  );

const upload = async (user: ReturnType<typeof userEvent.setup>, size = 10) =>
  user.upload(
    screen.getByTestId('bekleidung-import-file'),
    new File(['x'.repeat(size)], 'bekleidung.xlsx', { type: XLSX }),
  );

describe('BekleidungImportDialog', () => {
  beforeEach(() => vi.clearAllMocks());

  it('baut die Entscheidungen aus der Auswahl und zeigt das Ergebnis', async () => {
    previewBekleidungImport.mockResolvedValue(preview);
    importBekleidung.mockResolvedValue({ artikel: 2, stuecke: 5, ausgaben: 3, personsCreated: 1 });
    const user = userEvent.setup();
    renderDialog();
    await upload(user);

    expect(previewBekleidungImport).toHaveBeenCalledWith('ffnd', 'QkFTRTY0');
    expect(await screen.findByText('0 Zeilen · 2 Artikel · 3 Personen')).toBeInTheDocument();
    expect(screen.getByText('Doppelte Tag-Nummern (1)')).toBeInTheDocument();
    expect(screen.getByText('Statuskonflikte (1)')).toBeInTheDocument();

    // Unsichere Zuordnung ist nicht vorbelegt: Import gesperrt, Hinweis sichtbar
    expect(screen.getByRole('combobox', { name: 'Erika Musterfrau' })).not.toHaveTextContent(
      'Erika Musterfrau',
    );
    expect(screen.getByText('Noch 1 unsichere Zuordnung offen.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Importieren' })).toBeDisabled();

    // Poloshirt als Menge führen
    await user.click(screen.getByRole('combobox', { name: 'Führung Poloshirt' }));
    await user.click(screen.getByRole('option', { name: 'Menge' }));
    // Unsicher: statt Erika Musterfrau (p2) neu anlegen
    await user.click(screen.getByRole('combobox', { name: 'Erika Musterfrau' }));
    await user.click(within(screen.getByRole('listbox')).getByRole('option', { name: 'Neu anlegen' }));
    expect(screen.queryByText(/unsichere Zuordnung/)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Importieren' })).toBeEnabled();
    // Neu: der vorhandenen Person p1 zuordnen
    await user.click(screen.getByRole('combobox', { name: 'Moritz Muster' }));
    await user.click(screen.getByRole('option', { name: 'Max Mustermann' }));

    await user.click(screen.getByRole('button', { name: 'Importieren' }));
    expect(importBekleidung).toHaveBeenCalledWith('ffnd', 'QkFTRTY0', {
      fuehrung: { 'einsatz|jacke|': 'einzeln', 'dienst|polo|': 'menge' },
      persons: {
        'max mustermann': { personId: 'p1' },
        'erika musterfrau': { create: 'Erika Musterfrau' },
        'moritz muster': { personId: 'p1' },
      },
    });
    expect(
      await screen.findByText(/2 Artikel, 5 Stücke, 3 Ausgaben, 1 neue Personen/),
    ).toBeInTheDocument();
  });

  it('meldet einen nicht leeren Bestand verständlich', async () => {
    previewBekleidungImport.mockResolvedValue(preview);
    importBekleidung.mockResolvedValue({ success: false, error: 'notEmpty' });
    const user = userEvent.setup();
    renderDialog();
    await upload(user);
    await user.click(await screen.findByRole('combobox', { name: 'Erika Musterfrau' }));
    await user.click(screen.getByRole('option', { name: 'Erika Musterfrau' }));
    await user.click(screen.getByRole('button', { name: 'Importieren' }));
    expect(
      await screen.findByText(/Der Bekleidungsbestand dieser Gruppe ist nicht leer/),
    ).toBeInTheDocument();
  });

  it('meldet einen laufenden Import verständlich', async () => {
    previewBekleidungImport.mockResolvedValue({ ...preview, persons: [preview.persons[0]] });
    importBekleidung.mockResolvedValue({ success: false, error: 'importRunning' });
    const user = userEvent.setup();
    renderDialog();
    await upload(user);
    await user.click(await screen.findByRole('button', { name: 'Importieren' }));
    expect(await screen.findByText(/läuft gerade/)).toBeInTheDocument();
  });

  it('lehnt zu große Dateien schon im Browser ab', async () => {
    const user = userEvent.setup();
    renderDialog();
    await upload(user, 700_001);
    expect(screen.getByText('Die Datei ist zu groß (höchstens 700 kB).')).toBeInTheDocument();
    expect(previewBekleidungImport).not.toHaveBeenCalled();
  });
});

describe('defaultPersonChoices', () => {
  it('belegt nur eindeutige Fälle vor, unsichere bleiben offen', () => {
    const choices = defaultPersonChoices(preview);
    expect(choices).toEqual({ 'max mustermann': 'p1', 'moritz muster': '__new__' });
    expect(openPersonChoices(preview, choices)).toBe(1);
    expect(openPersonChoices(preview, { ...choices, 'erika musterfrau': 'p2' })).toBe(0);
  });
});
