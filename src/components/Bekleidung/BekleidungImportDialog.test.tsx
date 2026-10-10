// @vitest-environment jsdom
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ImportPreview, ImportRow } from '../../common/bekleidungImport';
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
    { key: 'max mustermann', vorname: 'Max', nachname: 'Mustermann', openCount: 2, match: { status: 'matched', personId: 'p1', candidates: ['p1'] } },
    { key: 'erika musterfrau', vorname: 'Erika', nachname: 'Musterfrau', openCount: 1, match: { status: 'uncertain', candidates: ['p2', 'p3'] } },
    { key: 'moritz muster', vorname: 'Moritz', nachname: 'Muster', openCount: 0, match: { status: 'new', candidates: [] } },
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
      rows: { 'einsatz:9': { tagNummer: null } },
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

  it('legt Personen auf Wunsch inaktiv an und kennzeichnet inaktive Personen', async () => {
    previewBekleidungImport.mockResolvedValue(preview);
    importBekleidung.mockResolvedValue({ artikel: 2, stuecke: 5, ausgaben: 3, personsCreated: 2 });
    const user = userEvent.setup();
    renderDialog();
    await upload(user);

    // offene Ausgaben je Person als Entscheidungshilfe
    expect(await screen.findByText('2 offen')).toBeInTheDocument();
    expect(screen.getByText('nichts offen')).toBeInTheDocument();

    // bestehende inaktive Person ist gekennzeichnet
    await user.click(screen.getByRole('combobox', { name: 'Erika Musterfrau' }));
    const listbox = within(screen.getByRole('listbox'));
    expect(listbox.getByRole('option', { name: 'Erika Mustermann (inaktiv)' })).toBeInTheDocument();
    await user.click(listbox.getByRole('option', { name: 'Neu anlegen (inaktiv)' }));

    await user.click(screen.getByRole('button', { name: 'Importieren' }));
    expect(importBekleidung).toHaveBeenCalledWith('ffnd', 'QkFTRTY0', {
      fuehrung: { 'einsatz|jacke|': 'einzeln', 'dienst|polo|': 'einzeln' },
      rows: { 'einsatz:9': { tagNummer: null } },
      persons: {
        'max mustermann': { personId: 'p1' },
        'erika musterfrau': { create: 'Erika Musterfrau', active: false },
        // neue Personen sind inaktiv vorbelegt
        'moritz muster': { create: 'Moritz Muster', active: false },
      },
    });
  });

  it('stellt neue Personen mit offener Ausgabe gesammelt auf aktiv', async () => {
    previewBekleidungImport.mockResolvedValue({
      ...preview,
      persons: [
        preview.persons[0],
        preview.persons[2],
        { key: 'lisa muster', vorname: 'Lisa', nachname: 'Muster', openCount: 1, match: { status: 'new', candidates: [] } },
      ],
    });
    importBekleidung.mockResolvedValue({ artikel: 2, stuecke: 5, ausgaben: 3, personsCreated: 2 });
    const user = userEvent.setup();
    renderDialog();
    await upload(user);

    await user.click(
      await screen.findByRole('button', { name: 'Neue Personen mit offener Ausgabe aktiv anlegen (1)' }),
    );
    await user.click(screen.getByRole('button', { name: 'Importieren' }));
    expect(importBekleidung).toHaveBeenCalledWith('ffnd', 'QkFTRTY0', {
      fuehrung: { 'einsatz|jacke|': 'einzeln', 'dienst|polo|': 'einzeln' },
      rows: { 'einsatz:9': { tagNummer: null } },
      persons: {
        'max mustermann': { personId: 'p1' },
        'moritz muster': { create: 'Moritz Muster', active: false },
        'lisa muster': { create: 'Lisa Muster' },
      },
    });
  });

  it('bereinigt doppelte Tag-Nummern und Statuskonflikte in der Vorschau', async () => {
    const base: ImportRow = {
      sheet: 'einsatz',
      rowNumber: 4,
      hersteller: 'Texport',
      art: 'Einsatzjacke',
      tagNummer: '1001',
      eigentum: 'feuerwehr',
      groesse: 'M',
      status: 'lager',
      waschgaengeAltbestand: 0,
      bemerkungen: [],
      ausgaben: [],
    };
    const block = (vorname: string, nachname: string, ausgegebenAm: string) => ({
      vorname,
      nachname,
      ausgegebenAm,
      datumUnbekannt: false,
    });
    const rows: ImportRow[] = [
      base,
      { ...base, rowNumber: 9, groesse: 'L' },
      {
        ...base,
        rowNumber: 12,
        tagNummer: '2002',
        status: 'ausgegeben',
        ausgaben: [block('Max', 'Mustermann', '2020-01-01'), block('Moritz', 'Muster', '2022-05-01')],
      },
    ];
    previewBekleidungImport.mockResolvedValue({
      ...preview,
      rows,
      persons: [preview.persons[0], preview.persons[2]],
      duplicateTags: [
        { tagNummer: '1001', rowNumbers: [{ sheet: 'einsatz', rowNumber: 4 }, { sheet: 'einsatz', rowNumber: 9 }] },
      ],
      statusConflicts: [{ sheet: 'einsatz', rowNumber: 12, message: '2 offene Ausgaben — nur die letzte bleibt offen' }],
    });
    importBekleidung.mockResolvedValue({ artikel: 2, stuecke: 3, ausgaben: 2, personsCreated: 1 });
    const user = userEvent.setup();
    renderDialog();
    await upload(user);

    // Vorbelegt: Zeile 4 behält die Nummer, Zeile 9 ohne
    await user.click(await screen.findByText('Doppelte Tag-Nummern (1)'));
    const tag9 = screen.getByRole('textbox', { name: 'Tag-Nummer Einsatzbekleidung Zeile 9' });
    expect(screen.getByRole('textbox', { name: 'Tag-Nummer Einsatzbekleidung Zeile 4' })).toHaveValue('1001');
    expect(tag9).toHaveValue('');

    // Dieselbe Nummer sperrt den Import
    await user.type(tag9, '1001');
    expect(screen.getByText('Tag-Nummer 1001 ist noch doppelt.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Importieren' })).toBeDisabled();
    await user.clear(tag9);
    await user.type(tag9, '1003');
    expect(screen.getByRole('button', { name: 'Importieren' })).toBeEnabled();

    // Statuskonflikt: die frühere Ausgabe offen lassen
    await user.click(screen.getByText('Statuskonflikte (1)'));
    await user.click(screen.getByRole('combobox', { name: 'Offen bei Einsatzbekleidung Zeile 12' }));
    await user.click(screen.getByRole('option', { name: 'Max Mustermann (seit 2020-01-01)' }));

    await user.click(screen.getByRole('button', { name: 'Importieren' }));
    expect(importBekleidung).toHaveBeenCalledWith(
      'ffnd',
      'QkFTRTY0',
      expect.objectContaining({
        rows: {
          'einsatz:9': { tagNummer: '1003' },
          'einsatz:12': { keepOpen: 0 },
        },
      }),
    );
  });

  it('ändert den Status einer Zeile', async () => {
    const row: ImportRow = {
      sheet: 'dienst',
      rowNumber: 7,
      hersteller: 'Fa. X',
      art: 'Poloshirt',
      eigentum: 'feuerwehr',
      groesse: 'L',
      status: 'ausgegeben',
      waschgaengeAltbestand: 0,
      bemerkungen: [],
      ausgaben: [],
    };
    previewBekleidungImport.mockResolvedValue({
      ...preview,
      rows: [row],
      persons: [preview.persons[0]],
      duplicateTags: [],
      statusConflicts: [{ sheet: 'dienst', rowNumber: 7, message: 'Status ausgegeben, aber keine offene Ausgabe' }],
    });
    importBekleidung.mockResolvedValue({ artikel: 1, stuecke: 0, ausgaben: 0, personsCreated: 0 });
    const user = userEvent.setup();
    renderDialog();
    await upload(user);

    await user.click(await screen.findByText('Statuskonflikte (1)'));
    expect(screen.getByText('ausgegeben ohne Person')).toBeInTheDocument();
    await user.click(screen.getByRole('combobox', { name: 'Status Dienstbekleidung Zeile 7' }));
    await user.click(screen.getByRole('option', { name: 'Lager' }));
    expect(screen.queryByText('ausgegeben ohne Person')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Importieren' }));
    expect(importBekleidung).toHaveBeenCalledWith(
      'ffnd',
      'QkFTRTY0',
      expect.objectContaining({ rows: { 'dienst:7': { status: 'lager' } } }),
    );
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
    expect(choices).toEqual({ 'max mustermann': 'p1', 'moritz muster': '__new_inactive__' });
    expect(openPersonChoices(preview, choices)).toBe(1);
    expect(openPersonChoices(preview, { ...choices, 'erika musterfrau': 'p2' })).toBe(0);
  });
});
