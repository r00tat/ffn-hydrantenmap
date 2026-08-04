import {
  normalizeName,
  type FahrtenbuchPerson,
} from '../../common/fahrtenbuch';

/** Ein Empfänger aus dem CSV-Export von start.blaulichtsms.net. */
export interface RecipientCsvRecord {
  id: string;
  name: string;
  phone: string;
  email: string;
  /** Spalte `comment` — trägt Fremdfeuerwehr und Funktion, z. B. „BFÜST-ND". */
  note: string;
}

/**
 * Fehler als Daten, nicht als fertiger Text — die Meldung entsteht erst beim
 * Rendern über `next-intl`, damit die Logik ohne Übersetzungen testbar bleibt.
 */
export type RecipientCsvError =
  | { kind: 'empty' }
  | { kind: 'missingColumns'; columns: string[] }
  | { kind: 'invalidRow'; line: number; reason: 'missingId' | 'missingName' }
  | { kind: 'duplicateId'; line: number; id: string };

export interface RecipientCsvParseResult {
  records: RecipientCsvRecord[];
  errors: RecipientCsvError[];
}

const REQUIRED_COLUMNS = ['id', 'givenname', 'surname'] as const;

/**
 * Zerlegt den Text in Zeilen aus Rohfeldern. Ein Trennzeichen oder
 * Zeilenumbruch innerhalb von Anführungszeichen gehört zum Feld — deshalb ein
 * Zustandsautomat und kein `split`.
 */
function splitRows(text: string, delimiter: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];

    if (quoted) {
      if (char === '"') {
        // Verdoppeltes Anführungszeichen ist ein maskiertes Zeichen im Feld.
        if (text[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          quoted = false;
        }
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') {
      quoted = true;
      continue;
    }
    if (char === delimiter) {
      row.push(field);
      field = '';
      continue;
    }
    if (char === '\n' || char === '\r') {
      // CRLF ist ein Umbruch, nicht zwei.
      if (char === '\r' && text[i + 1] === '\n') i += 1;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
      continue;
    }
    field += char;
  }

  if (field || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

/** Zählt ein Zeichen außerhalb von Anführungszeichen. */
function countOutsideQuotes(line: string, char: string): number {
  let quoted = false;
  let count = 0;
  for (const current of line) {
    if (current === '"') quoted = !quoted;
    else if (!quoted && current === char) count += 1;
  }
  return count;
}

function sniffDelimiter(headerLine: string): string {
  return countOutsideQuotes(headerLine, ',') >
    countOutsideQuotes(headerLine, ';')
    ? ','
    : ';';
}

/**
 * Nimmt dem Feld den Excel-Schutz. Der Export schreibt Telefonnummern als
 * `="+4366480434691"`, damit Excel die Nummer nicht als Zahl formatiert; ohne
 * diesen Schritt landet die Formel als Telefonnummer in Firestore.
 */
function unwrapField(value: string): string {
  const trimmed = value.trim();
  if (!trimmed.startsWith('=')) return trimmed;
  const rest = trimmed.slice(1).trim();
  return (
    rest.startsWith('"') && rest.endsWith('"') && rest.length >= 2
      ? rest.slice(1, -1)
      : rest
  ).trim();
}

/**
 * Liest den Teilnehmer-Export. Spalten werden über die Kopfzeile zugeordnet,
 * nicht über die Position — die Reihenfolge ist nicht zugesagt. Unbrauchbare
 * Zeilen werden verworfen und gemeldet statt geraten.
 */
export function parseRecipientCsv(text: string): RecipientCsvParseResult {
  // Ein BOM würde sonst zur ersten Spaltenüberschrift gehören und `id`
  // unauffindbar machen.
  const clean = text.replace(/^﻿/, '');
  if (!clean.trim()) return { records: [], errors: [{ kind: 'empty' }] };

  const firstBreak = clean.search(/\r|\n/);
  const headerLine = firstBreak < 0 ? clean : clean.slice(0, firstBreak);
  const rows = splitRows(clean, sniffDelimiter(headerLine));

  const header = (rows[0] ?? []).map((cell) => unwrapField(cell).toLowerCase());
  const missing = REQUIRED_COLUMNS.filter((name) => !header.includes(name));
  if (missing.length > 0) {
    return {
      records: [],
      errors: [{ kind: 'missingColumns', columns: missing }],
    };
  }

  const column = (name: string) => header.indexOf(name);
  const idIndex = column('id');
  const givennameIndex = column('givenname');
  const surnameIndex = column('surname');
  const msisdnIndex = column('msisdn');
  const emailIndex = column('email');
  const commentIndex = column('comment');
  const cell = (row: string[], index: number) =>
    index >= 0 ? unwrapField(row[index] ?? '') : '';

  const records: RecipientCsvRecord[] = [];
  const errors: RecipientCsvError[] = [];
  const seen = new Set<string>();

  for (let i = 1; i < rows.length; i += 1) {
    const row = rows[i];
    // Zeilennummer wie im Editor: die Kopfzeile ist Zeile 1.
    const line = i + 1;
    if (row.every((value) => !value.trim())) continue;

    const id = cell(row, idIndex);
    if (!id) {
      errors.push({ kind: 'invalidRow', line, reason: 'missingId' });
      continue;
    }
    const name =
      `${cell(row, givennameIndex)} ${cell(row, surnameIndex)}`.trim();
    if (!name) {
      errors.push({ kind: 'invalidRow', line, reason: 'missingName' });
      continue;
    }
    if (seen.has(id)) {
      errors.push({ kind: 'duplicateId', line, id });
      continue;
    }
    seen.add(id);
    records.push({
      id,
      name,
      phone: cell(row, msisdnIndex),
      email: cell(row, emailIndex),
      note: cell(row, commentIndex),
    });
  }

  if (records.length === 0 && errors.length === 0) {
    errors.push({ kind: 'empty' });
  }
  return { records, errors };
}

export type PersonImportAction =
  'create' | 'link' | 'update' | 'unchanged' | 'ambiguous';

export type PersonImportChange = 'name' | 'phone' | 'email' | 'note';

export interface PersonImportPlanRow {
  recipientId: string;
  name: string;
  phone: string;
  email: string;
  note: string;
  action: PersonImportAction;
  /** Betroffene Person bei `link`, `update`, `unchanged` und eindeutig
   *  zuordenbarem `ambiguous`. */
  personId?: string;
  /**
   * Was sich gegenüber dem Fahrtenbuch ändert — bei `update` und bei `link`.
   * Nur diese Felder werden geschrieben; eine leere CSV-Spalte gilt nie als
   * Änderung und löscht deshalb nichts.
   */
  changes: PersonImportChange[];
}

export interface PersonImportPlan {
  rows: PersonImportPlanRow[];
  /** Aktive Personen mit BlaulichtSMS-ID, die in der CSV nicht vorkommen. */
  missing: { personId: string; name: string }[];
}

function changesFor(
  record: RecipientCsvRecord,
  person: FahrtenbuchPerson,
): PersonImportChange[] {
  const changes: PersonImportChange[] = [];
  // Der Name über die Normalisierung: sonst meldet jeder Import dieselben
  // Zeilen, nur weil Groß-/Kleinschreibung oder Leerzeichen abweichen.
  if (normalizeName(record.name) !== normalizeName(person.name)) {
    changes.push('name');
  }
  // Eine leere CSV-Spalte ist keine Änderung — sie würde sonst einen im
  // Fahrtenbuch gepflegten Wert löschen.
  if (record.phone && record.phone !== (person.phone ?? ''))
    changes.push('phone');
  if (record.email && record.email !== (person.email ?? ''))
    changes.push('email');
  if (record.note && record.note !== (person.note ?? '')) changes.push('note');
  return changes;
}

/**
 * Baut aus den angezeigten Änderungen das Firestore-Teilupdate. Was die
 * Vorschau nicht als Änderung ausweist, wird auch nicht geschrieben.
 */
export function fieldsForChanges(
  record: RecipientCsvRecord,
  changes: PersonImportChange[],
): Partial<Pick<FahrtenbuchPerson, 'name' | 'phone' | 'email' | 'note'>> {
  const fields: Partial<
    Pick<FahrtenbuchPerson, 'name' | 'phone' | 'email' | 'note'>
  > = {};
  if (changes.includes('name')) fields.name = record.name;
  if (changes.includes('phone')) fields.phone = record.phone;
  if (changes.includes('email')) fields.email = record.email;
  if (changes.includes('note')) fields.note = record.note;
  return fields;
}

/**
 * Plant den Import gegen den Personenbestand der Gruppe. Mehrdeutige
 * Namenstreffer werden gemeldet statt geraten: mehrere gleichnamige Personen,
 * mehrere gleichnamige Empfänger für dieselbe Person und Personen, die bereits
 * auf eine andere Empfänger-ID zeigen (in BlaulichtSMS gelöscht und mit neuer
 * ID neu angelegt). Eine zweite gleichnamige Person wäre im Fahrer-Dropdown
 * nicht unterscheidbar, deshalb entscheidet der Admin diese Fälle im
 * Personen-Dialog.
 */
export function planPersonCsvImport(
  records: RecipientCsvRecord[],
  existing: FahrtenbuchPerson[],
): PersonImportPlan {
  const byRecipientId = new Map(
    existing
      .filter((p) => p.blaulichtSmsRecipientId && p.id)
      .map((p) => [p.blaulichtSmsRecipientId as string, p]),
  );
  /** In diesem Lauf bereits verplante Personen — jede nur einmal verknüpfen. */
  const claimedPersonIds = new Set<string>();

  const rows = records.map<PersonImportPlanRow>((record) => {
    const base = {
      recipientId: record.id,
      name: record.name,
      phone: record.phone,
      email: record.email,
      note: record.note,
      changes: [] as PersonImportChange[],
    };

    const linked = byRecipientId.get(record.id);
    if (linked) {
      const changes = changesFor(record, linked);
      return {
        ...base,
        personId: linked.id,
        action: changes.length > 0 ? 'update' : 'unchanged',
        changes,
      };
    }

    const normalized = normalizeName(record.name);
    const sameName = existing.filter(
      (p) => p.id && normalizeName(p.name) === normalized,
    );
    const unlinked = sameName.filter((p) => !p.blaulichtSmsRecipientId);
    const free = unlinked.filter((p) => !claimedPersonIds.has(p.id as string));

    if (unlinked.length > 1 || (unlinked.length === 1 && free.length === 0)) {
      return {
        ...base,
        action: 'ambiguous',
        personId: sameName.length === 1 ? sameName[0].id : undefined,
      };
    }
    if (free.length === 1) {
      claimedPersonIds.add(free[0].id as string);
      return {
        ...base,
        action: 'link',
        personId: free[0].id,
        // Beim Verknüpfen bleibt der Name stehen — er hat den Treffer erzeugt.
        // Kontaktdaten und Notiz werden ergänzt, soweit die CSV sie liefert.
        changes: changesFor(record, free[0]).filter(
          (change) => change !== 'name',
        ),
      };
    }
    // Kein freier Namenstreffer: zeigt eine gleichnamige Person auf eine andere
    // Empfänger-ID, ist das eine Neuanlage in BlaulichtSMS — nicht duplizieren.
    if (sameName.length > 0) {
      return {
        ...base,
        action: 'ambiguous',
        personId: sameName.length === 1 ? sameName[0].id : undefined,
      };
    }
    return { ...base, action: 'create' };
  });

  const csvIds = new Set(records.map((r) => r.id));
  const missing = existing
    .filter(
      (p) =>
        p.id &&
        p.blaulichtSmsRecipientId &&
        !csvIds.has(p.blaulichtSmsRecipientId) &&
        // Handgepflegte Personen waren nie in BlaulichtSMS, schon deaktivierte
        // ändern sich durch ein weiteres Deaktivieren nicht.
        p.active !== false,
    )
    .map((p) => ({ personId: p.id as string, name: p.name }));

  return { rows, missing };
}

export interface PersonImportSelection {
  /** Empfänger-IDs aus der Vorschau, die übernommen werden sollen. */
  recipientIds: string[];
  /** Personen, die auf `active: false` gesetzt werden sollen. */
  deactivatePersonIds: string[];
}

export interface PersonImportWrite {
  personId: string;
  record: RecipientCsvRecord;
  /** Zu schreibende Felder — bei `link` zusätzlich die Empfänger-ID. */
  changes: PersonImportChange[];
}

export interface ResolvedPersonImport {
  create: RecipientCsvRecord[];
  link: PersonImportWrite[];
  update: PersonImportWrite[];
  deactivate: string[];
  /** Ausgewählt, aber nicht übernehmbar: unbekannt, mehrdeutig, unverändert. */
  skipped: number;
}

/**
 * Löst die Auswahl des Dialogs gegen den serverseitig neu erstellten Plan auf.
 * Der Client bestimmt nur, *was* übernommen wird — die Daten kommen aus dem
 * Plan, nicht aus der Auswahl.
 */
export function resolvePersonImportSelection(
  plan: PersonImportPlan,
  selection: PersonImportSelection,
): ResolvedPersonImport {
  const rowsById = new Map(plan.rows.map((row) => [row.recipientId, row]));
  const missingIds = new Set(plan.missing.map((entry) => entry.personId));
  const handled = new Set<string>();
  const result: ResolvedPersonImport = {
    create: [],
    link: [],
    update: [],
    deactivate: [],
    skipped: 0,
  };

  for (const recipientId of selection.recipientIds) {
    if (handled.has(recipientId)) continue;
    handled.add(recipientId);

    const row = rowsById.get(recipientId);
    if (!row) {
      result.skipped += 1;
      continue;
    }
    const record: RecipientCsvRecord = {
      id: row.recipientId,
      name: row.name,
      phone: row.phone,
      email: row.email,
      note: row.note,
    };
    if (row.action === 'create') result.create.push(record);
    else if (row.action === 'link' && row.personId) {
      result.link.push({
        personId: row.personId,
        record,
        changes: row.changes,
      });
    } else if (row.action === 'update' && row.personId) {
      result.update.push({
        personId: row.personId,
        record,
        changes: row.changes,
      });
    } else result.skipped += 1;
  }

  for (const personId of selection.deactivatePersonIds) {
    // Nur was der Plan auch als Abgang kennt — sonst könnte der Dialog
    // beliebige Personen der Gruppe deaktivieren.
    if (missingIds.has(personId) && !result.deactivate.includes(personId)) {
      result.deactivate.push(personId);
    } else if (!missingIds.has(personId)) result.skipped += 1;
  }

  return result;
}
