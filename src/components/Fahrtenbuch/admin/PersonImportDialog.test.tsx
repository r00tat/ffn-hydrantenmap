// @vitest-environment jsdom
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { FahrtenbuchPerson } from '../../../common/fahrtenbuch';
import { renderWithIntl } from '../../../test-utils/intlRender';
import { planPersonCsvImport } from '../personCsvImport';

// `stammdatenActions` ist eine 'use server'/'server-only'-Datei und lässt sich
// im Test nicht laden — die beiden Actions werden ersetzt.
const { previewPersonCsvImport, importPersonsFromCsv } = vi.hoisted(() => ({
  previewPersonCsvImport: vi.fn(),
  importPersonsFromCsv: vi.fn(),
}));

vi.mock('../stammdatenActions', () => ({
  previewPersonCsvImport,
  importPersonsFromCsv,
}));

import PersonImportDialog from './PersonImportDialog';

function person(overrides: Partial<FahrtenbuchPerson>): FahrtenbuchPerson {
  return {
    id: 'p1',
    name: 'Max Mustermann',
    active: true,
    createdAt: '',
    createdBy: '',
    updatedAt: '',
    updatedBy: '',
    ...overrides,
  };
}

/** Der Plan entsteht wie im Server über die echte Logik. */
const plan = planPersonCsvImport(
  [
    {
      id: 'neu',
      name: 'Neu Person',
      phone: '+43664333',
      email: 'neu@ff.at',
      note: 'FF Weiden am See',
    },
    {
      id: 'r1',
      name: 'Max Mustermann',
      phone: '+43664111',
      email: '',
      note: 'BFÜST-ND',
    },
    {
      id: 'r2',
      name: 'Erika Musterfrau',
      phone: '+43664999',
      email: '',
      note: '',
    },
    { id: 'r3', name: 'Gleich Name', phone: '', email: '', note: '' },
    {
      id: 'r4',
      name: 'Bleibt Gleich',
      phone: '+43664777',
      email: '',
      note: '',
    },
  ],
  [
    person({ id: 'p1', name: 'Max Mustermann' }),
    person({
      id: 'p2',
      name: 'Erika Musterfrau',
      blaulichtSmsRecipientId: 'r2',
      phone: '+43664222',
    }),
    person({ id: 'p3', name: 'Gleich Name' }),
    person({ id: 'p4', name: 'Gleich Name' }),
    person({
      id: 'p5',
      name: 'Bleibt Gleich',
      blaulichtSmsRecipientId: 'r4',
      phone: '+43664777',
    }),
    person({ id: 'p6', name: 'Hans Weg', blaulichtSmsRecipientId: 'weg' }),
  ],
);

const CSV = 'id;givenname;surname\nneu;Neu;Person';

async function chooseFile(text = CSV) {
  const user = userEvent.setup();
  await user.upload(
    screen.getByLabelText('CSV-Datei wählen'),
    new File([text], 'recipients.csv', { type: 'text/csv' }),
  );
  return user;
}

describe('PersonImportDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    previewPersonCsvImport.mockResolvedValue({
      success: true,
      ...plan,
      parseErrors: [],
    });
    importPersonsFromCsv.mockResolvedValue({
      success: true,
      created: 1,
      linked: 1,
      updated: 1,
      deactivated: 0,
      skipped: 0,
    });
  });

  it('nennt die Zielgruppe und lädt erst nach der Dateiauswahl', () => {
    // Der Dialog verdeckt die Gruppenauswahl der Admin-Seite — ohne den Namen
    // im Dialog ist beim Import nicht erkennbar, wohin importiert wird.
    renderWithIntl(
      <PersonImportDialog
        groupId="g1"
        groupName="FF Neusiedl am See"
        onClose={vi.fn()}
      />,
    );

    expect(screen.getByText(/FF Neusiedl am See/)).toBeInTheDocument();
    expect(previewPersonCsvImport).not.toHaveBeenCalled();
  });

  it('schickt den Dateiinhalt an die Vorschau', async () => {
    renderWithIntl(
      <PersonImportDialog groupId="g1" groupName="g1" onClose={vi.fn()} />,
    );
    await chooseFile();

    expect(await screen.findByLabelText('Neu Person')).toBeInTheDocument();
    expect(previewPersonCsvImport).toHaveBeenCalledWith('g1', CSV);
  });

  it('wählt übernehmbare Zeilen vor und sperrt die übrigen', async () => {
    renderWithIntl(
      <PersonImportDialog groupId="g1" groupName="g1" onClose={vi.fn()} />,
    );
    await chooseFile();

    expect(await screen.findByLabelText('Neu Person')).toBeChecked();
    expect(screen.getByLabelText('Max Mustermann')).toBeChecked();
    expect(screen.getByLabelText('Erika Musterfrau')).toBeChecked();

    // Mehrdeutig und unverändert sind nichts, was der Import entscheiden darf.
    expect(screen.getByLabelText('Gleich Name')).toBeDisabled();
    expect(screen.getByLabelText('Gleich Name')).not.toBeChecked();
    expect(screen.getByLabelText('Bleibt Gleich')).toBeDisabled();
  });

  it('zeigt je Zeile den Status und bei Änderungen die betroffenen Felder', async () => {
    renderWithIntl(
      <PersonImportDialog groupId="g1" groupName="g1" onClose={vi.fn()} />,
    );
    await screen.findByLabelText('CSV-Datei wählen');
    await chooseFile();
    await screen.findByLabelText('Neu Person');

    expect(screen.getByText('neu')).toBeInTheDocument();
    expect(screen.getByText('wird verknüpft')).toBeInTheDocument();
    expect(screen.getByText('unverändert')).toBeInTheDocument();
    expect(screen.getByText('mehrdeutig')).toBeInTheDocument();
    // Die verknüpfte Zeile ergänzt Telefon und Notiz, die verknüpfte Person
    // hatte beides nicht; die aktualisierte weicht nur in der Nummer ab.
    expect(screen.getByText('ändert: Telefon, Notiz')).toBeInTheDocument();
    expect(screen.getByText('ändert: Telefon')).toBeInTheDocument();
  });

  it('zeigt die Notiz aus der CSV-Spalte comment', () => {
    // Die Notiz trägt Fremdfeuerwehr und Funktion — daran entscheidet der Admin,
    // welche Empfänger er überhaupt braucht.
    expect(plan.rows[0]).toMatchObject({ note: 'FF Weiden am See' });
  });

  it('zeigt die Notiz in der Vorschau', async () => {
    renderWithIntl(
      <PersonImportDialog groupId="g1" groupName="g1" onClose={vi.fn()} />,
    );
    await chooseFile();

    expect(await screen.findByText('FF Weiden am See')).toBeInTheDocument();
  });

  it('bietet Personen ohne CSV-Eintrag zum Deaktivieren an, aber nicht vorgewählt', async () => {
    renderWithIntl(
      <PersonImportDialog groupId="g1" groupName="g1" onClose={vi.fn()} />,
    );
    await chooseFile();

    const checkbox = await screen.findByLabelText('Deaktivieren: Hans Weg');
    expect(checkbox).not.toBeChecked();
  });

  it('importiert die Auswahl und meldet das Ergebnis', async () => {
    renderWithIntl(
      <PersonImportDialog groupId="g1" groupName="g1" onClose={vi.fn()} />,
    );
    const user = await chooseFile();
    await screen.findByLabelText('Neu Person');

    await user.click(screen.getByLabelText('Max Mustermann'));
    await user.click(screen.getByLabelText('Deaktivieren: Hans Weg'));
    await user.click(screen.getByRole('button', { name: 'Importieren' }));

    expect(importPersonsFromCsv).toHaveBeenCalledWith('g1', CSV, {
      recipientIds: ['neu', 'r2'],
      deactivatePersonIds: ['p6'],
    });
    expect(
      await screen.findByText(
        '1 angelegt, 1 verknüpft, 1 aktualisiert, 0 deaktiviert, 0 übersprungen',
      ),
    ).toBeInTheDocument();
    // Vorschau neu laden, damit übernommene Zeilen nicht ein zweites Mal
    // ausgewählt werden können.
    expect(previewPersonCsvImport).toHaveBeenCalledTimes(2);
  });

  it('meldet Fehler aus dem Parser mit Zeilennummer', async () => {
    previewPersonCsvImport.mockResolvedValue({
      success: true,
      rows: [],
      missing: [],
      parseErrors: [
        { kind: 'invalidRow', line: 7, reason: 'missingName' },
        { kind: 'duplicateId', line: 9, id: 'r1' },
      ],
    });
    renderWithIntl(
      <PersonImportDialog groupId="g1" groupName="g1" onClose={vi.fn()} />,
    );
    await chooseFile();

    expect(
      await screen.findByText('Zeile 7: ohne Namen, übersprungen'),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        'Zeile 9: Empfänger-ID r1 kommt mehrfach vor, übersprungen',
      ),
    ).toBeInTheDocument();
  });

  it('meldet fehlende Pflichtspalten', async () => {
    previewPersonCsvImport.mockResolvedValue({
      success: true,
      rows: [],
      missing: [],
      parseErrors: [
        { kind: 'missingColumns', columns: ['givenname', 'surname'] },
      ],
    });
    renderWithIntl(
      <PersonImportDialog groupId="g1" groupName="g1" onClose={vi.fn()} />,
    );
    await chooseFile();

    expect(
      await screen.findByText(
        'Fehlende Spalten in der Kopfzeile: givenname, surname',
      ),
    ).toBeInTheDocument();
  });

  it('meldet einen Fehler aus der Vorschau', async () => {
    previewPersonCsvImport.mockResolvedValue({
      success: false,
      rows: [],
      missing: [],
      parseErrors: [],
      error: 'kaputt',
    });
    renderWithIntl(
      <PersonImportDialog groupId="g1" groupName="g1" onClose={vi.fn()} />,
    );
    await chooseFile();

    expect(
      await screen.findByText('Laden fehlgeschlagen: kaputt'),
    ).toBeInTheDocument();
  });
});
