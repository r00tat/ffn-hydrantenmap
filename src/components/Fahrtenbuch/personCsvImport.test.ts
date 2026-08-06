import { describe, expect, it } from 'vitest';
import type { FahrtenbuchPerson } from '../../common/fahrtenbuch';
import {
  fieldsForChanges,
  parseRecipientCsv,
  planPersonCsvImport,
  resolvePersonImportSelection,
} from './personCsvImport';

/** Kopfzeile wie im Export von start.blaulichtsms.net. */
const HEADER =
  '"id";"customerId";"msisdn";"givenname";"surname";"noPremium";"email";"comment"';

function row(
  id: string,
  givenname: string,
  surname: string,
  msisdn = '+436640000000',
  email = '',
  comment = '',
) {
  // Die Telefonnummer trägt im echten Export einen Excel-Schutz (`="…"`),
  // damit Excel die Nummer nicht als Zahl interpretiert.
  return `"${id}";"105104";="${msisdn}";"${givenname}";"${surname}";"";"${email}";"${comment}"`;
}

function csv(...rows: string[]) {
  return [HEADER, ...rows].join('\r\n');
}

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

describe('parseRecipientCsv', () => {
  it('liest den Export mit Semikolon, Anführungszeichen und CRLF', () => {
    const result = parseRecipientCsv(
      csv(
        row('r1', 'Alexander', 'Pinetz', '+436763776410'),
        row(
          'r2',
          'Thomas',
          'Steiner',
          '+436764658220',
          'thomas@example.at',
          'FF Weiden am See',
        ),
      ),
    );

    expect(result.errors).toEqual([]);
    expect(result.records).toEqual([
      {
        id: 'r1',
        name: 'Alexander Pinetz',
        phone: '+436763776410',
        email: '',
        note: '',
      },
      {
        id: 'r2',
        name: 'Thomas Steiner',
        phone: '+436764658220',
        email: 'thomas@example.at',
        note: 'FF Weiden am See',
      },
    ]);
  });

  it('entfernt den Excel-Schutz vor der Telefonnummer', () => {
    // Ohne diesen Schritt landet `="+43…"` als Telefonnummer in Firestore.
    const result = parseRecipientCsv(csv(row('r1', 'Max', 'Mustermann')));
    expect(result.records[0].phone).toBe('+436640000000');
  });

  it('verträgt BOM, Zeilenumbruch am Ende und Umlaute', () => {
    const result = parseRecipientCsv(
      `﻿${csv(row('r1', 'Erik', 'Gsöllpointner'), row('r2', 'Günther', 'Köstner'))}\r\n`,
    );

    expect(result.errors).toEqual([]);
    expect(result.records.map((r) => r.name)).toEqual([
      'Erik Gsöllpointner',
      'Günther Köstner',
    ]);
  });

  it('erkennt Komma als Trennzeichen', () => {
    // Manche Exportvarianten (englisches Locale) liefern Komma.
    const result = parseRecipientCsv(
      'id,customerId,msisdn,givenname,surname,noPremium,email,comment\n' +
        '"r1","105104","+436640000000","Max","Mustermann","","max@example.at","BFÜST-ND"',
    );

    expect(result.errors).toEqual([]);
    expect(result.records).toEqual([
      {
        id: 'r1',
        name: 'Max Mustermann',
        phone: '+436640000000',
        email: 'max@example.at',
        note: 'BFÜST-ND',
      },
    ]);
  });

  it('hält ein Trennzeichen innerhalb von Anführungszeichen zusammen', () => {
    const result = parseRecipientCsv(
      csv(row('r1', 'Max', 'Mustermann', '+436640000000', '', 'FF Weiden; ND')),
    );

    expect(result.errors).toEqual([]);
    expect(result.records[0].name).toBe('Max Mustermann');
  });

  it('ordnet die Spalten über die Kopfzeile zu, nicht über die Position', () => {
    const result = parseRecipientCsv(
      '"surname";"givenname";"id";"msisdn"\n' +
        '"Mustermann";"Max";"r1";="+436640000000"',
    );

    expect(result.errors).toEqual([]);
    expect(result.records).toEqual([
      {
        id: 'r1',
        name: 'Max Mustermann',
        phone: '+436640000000',
        email: '',
        note: '',
      },
    ]);
  });

  it('meldet fehlende Pflichtspalten statt zu raten', () => {
    const result = parseRecipientCsv('"id";"msisdn"\n"r1";="+43664"');

    expect(result.records).toEqual([]);
    expect(result.errors).toEqual([
      { kind: 'missingColumns', columns: ['givenname', 'surname'] },
    ]);
  });

  it('meldet eine leere Datei', () => {
    expect(parseRecipientCsv('   ').errors).toEqual([{ kind: 'empty' }]);
    expect(parseRecipientCsv(HEADER).errors).toEqual([{ kind: 'empty' }]);
  });

  it('verwirft Zeilen ohne ID oder ohne Namen mit Zeilennummer', () => {
    const result = parseRecipientCsv(
      csv(
        row('', 'Max', 'Mustermann'),
        row('r2', '', ''),
        row('r3', 'Erika', 'Musterfrau'),
      ),
    );

    expect(result.records.map((r) => r.id)).toEqual(['r3']);
    expect(result.errors).toEqual([
      { kind: 'invalidRow', line: 2, reason: 'missingId' },
      { kind: 'invalidRow', line: 3, reason: 'missingName' },
    ]);
  });

  it('behält bei doppelter ID den ersten Satz und meldet den zweiten', () => {
    const result = parseRecipientCsv(
      csv(row('r1', 'Max', 'Mustermann'), row('r1', 'Max', 'Mustermann-Neu')),
    );

    expect(result.records.map((r) => r.name)).toEqual(['Max Mustermann']);
    expect(result.errors).toEqual([{ kind: 'duplicateId', line: 3, id: 'r1' }]);
  });
});

describe('planPersonCsvImport', () => {
  const records = [
    {
      id: 'r1',
      name: 'Max Mustermann',
      phone: '+43664111',
      email: '',
      note: '',
    },
    {
      id: 'r2',
      name: 'Erika Musterfrau',
      phone: '+43664222',
      email: '',
      note: '',
    },
  ];

  it('legt unbekannte Empfänger neu an', () => {
    const plan = planPersonCsvImport(records, []);
    expect(plan.rows.map((r) => [r.recipientId, r.action])).toEqual([
      ['r1', 'create'],
      ['r2', 'create'],
    ]);
    expect(plan.missing).toEqual([]);
  });

  it('verknüpft bestehende Personen über den normalisierten Namen', () => {
    const plan = planPersonCsvImport(records, [
      person({ id: 'p1', name: 'max mustermann' }),
    ]);

    expect(plan.rows[0]).toMatchObject({
      recipientId: 'r1',
      action: 'link',
      personId: 'p1',
    });
    expect(plan.rows[1].action).toBe('create');
  });

  it('meldet eine verknüpfte Person ohne Abweichung als unverändert', () => {
    const plan = planPersonCsvImport(records, [
      person({
        id: 'p1',
        name: 'Max Mustermann',
        blaulichtSmsRecipientId: 'r1',
        phone: '+43664111',
      }),
    ]);

    expect(plan.rows[0]).toMatchObject({ action: 'unchanged', personId: 'p1' });
  });

  it('bietet Abweichungen bei verknüpften Personen zur Aktualisierung an', () => {
    const plan = planPersonCsvImport(
      [
        {
          id: 'r1',
          name: 'Max Musterherr',
          phone: '+43664999',
          email: 'm@x.at',
          note: 'BFÜST-ND',
        },
      ],
      [
        person({
          id: 'p1',
          name: 'Max Mustermann',
          blaulichtSmsRecipientId: 'r1',
          phone: '+43664111',
        }),
      ],
    );

    expect(plan.rows[0]).toMatchObject({ action: 'update', personId: 'p1' });
    expect(plan.rows[0].changes).toEqual(['name', 'phone', 'email', 'note']);
  });

  it('ignoriert reine Schreibweise-Unterschiede im Namen', () => {
    // Sonst meldet jeder Import dieselben Zeilen als Änderung, nur weil im
    // Fahrtenbuch „Max Mustermann" und in BlaulichtSMS „MAX MUSTERMANN" steht.
    const plan = planPersonCsvImport(
      [
        {
          id: 'r1',
          name: 'MAX  MUSTERMANN',
          phone: '+43664111',
          email: '',
          note: '',
        },
      ],
      [
        person({
          id: 'p1',
          name: 'Max Mustermann',
          blaulichtSmsRecipientId: 'r1',
          phone: '+43664111',
        }),
      ],
    );

    expect(plan.rows[0].action).toBe('unchanged');
  });

  it('meldet mehrere gleichnamige Personen als mehrdeutig', () => {
    const plan = planPersonCsvImport(
      [records[0]],
      [
        person({ id: 'p1', name: 'Max Mustermann' }),
        person({ id: 'p2', name: 'Max Mustermann' }),
      ],
    );

    expect(plan.rows[0].action).toBe('ambiguous');
  });

  it('verknüpft jede Person nur einmal und meldet den zweiten Treffer', () => {
    const plan = planPersonCsvImport(
      [
        { id: 'r1', name: 'Max Mustermann', phone: '', email: '', note: '' },
        { id: 'r2', name: 'Max Mustermann', phone: '', email: '', note: '' },
      ],
      [person({ id: 'p1', name: 'Max Mustermann' })],
    );

    expect(plan.rows.map((r) => r.action)).toEqual(['link', 'ambiguous']);
  });

  it('meldet einen gleichnamigen Empfänger mit fremder ID als mehrdeutig', () => {
    // In BlaulichtSMS gelöscht und mit neuer ID neu angelegt — die ID gehört
    // umgehängt, nicht eine zweite Person angelegt.
    const plan = planPersonCsvImport(
      [records[0]],
      [
        person({
          id: 'p1',
          name: 'Max Mustermann',
          blaulichtSmsRecipientId: 'alt',
        }),
      ],
    );

    expect(plan.rows[0]).toMatchObject({ action: 'ambiguous', personId: 'p1' });
  });

  it('listet verknüpfte Personen auf, die in der CSV fehlen', () => {
    const plan = planPersonCsvImport(
      [records[0]],
      [
        person({
          id: 'p1',
          name: 'Max Mustermann',
          blaulichtSmsRecipientId: 'r1',
          phone: '+43664111',
        }),
        person({
          id: 'p2',
          name: 'Hans Weg',
          blaulichtSmsRecipientId: 'weg',
        }),
        // Handgepflegt, war nie in BlaulichtSMS — darf nicht als Abgang gelten.
        person({ id: 'p3', name: 'Handarbeit' }),
        // Schon deaktiviert — ein zweites Deaktivieren ändert nichts.
        person({
          id: 'p4',
          name: 'Alt Inaktiv',
          blaulichtSmsRecipientId: 'alt',
          active: false,
        }),
      ],
    );

    expect(plan.missing).toEqual([{ personId: 'p2', name: 'Hans Weg' }]);
  });
});

describe('resolvePersonImportSelection', () => {
  const plan = planPersonCsvImport(
    [
      {
        id: 'neu',
        name: 'Neu Person',
        phone: '+43664333',
        email: '',
        note: '',
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
      { id: 'r3', name: 'Doppel Name', phone: '', email: '', note: '' },
    ],
    [
      // Namenstreffer ohne ID → link
      person({ id: 'p1', name: 'Max Mustermann' }),
      // Verknüpft, Telefon abweichend → update
      person({
        id: 'p2',
        name: 'Erika Musterfrau',
        blaulichtSmsRecipientId: 'r2',
        phone: '+43664222',
      }),
      // Zwei gleichnamige → ambiguous
      person({ id: 'p3', name: 'Doppel Name' }),
      person({ id: 'p4', name: 'Doppel Name' }),
      // Verknüpft, aber nicht in der CSV → Abgang
      person({ id: 'p5', name: 'Hans Weg', blaulichtSmsRecipientId: 'weg' }),
    ],
  );

  it('teilt die Auswahl in anlegen, verknüpfen und aktualisieren auf', () => {
    const resolved = resolvePersonImportSelection(plan, {
      recipientIds: ['neu', 'r1', 'r2'],
      deactivatePersonIds: [],
    });

    expect(resolved.create.map((r) => r.id)).toEqual(['neu']);
    expect(resolved.link).toEqual([
      {
        personId: 'p1',
        record: {
          id: 'r1',
          name: 'Max Mustermann',
          phone: '+43664111',
          email: '',
          note: 'BFÜST-ND',
        },
        // Beim Verknüpfen wird nur ergänzt, was die CSV auch liefert.
        changes: ['phone', 'note'],
      },
    ]);
    expect(resolved.update.map((u) => u.personId)).toEqual(['p2']);
    expect(resolved.skipped).toBe(0);
  });

  it('überspringt mehrdeutige und unbekannte Empfänger', () => {
    const resolved = resolvePersonImportSelection(plan, {
      recipientIds: ['r3', 'gibtsnicht', 'neu', 'neu'],
      deactivatePersonIds: [],
    });

    expect(resolved.create.map((r) => r.id)).toEqual(['neu']);
    // Doppelte Auswahl zählt nur einmal und nicht als übersprungen.
    expect(resolved.skipped).toBe(2);
  });

  it('deaktiviert nur Personen, die der Plan als Abgang kennt', () => {
    // Ohne diese Prüfung könnte der Dialog jede Person der Gruppe deaktivieren.
    const resolved = resolvePersonImportSelection(plan, {
      recipientIds: [],
      deactivatePersonIds: ['p5', 'p1'],
    });

    expect(resolved.deactivate).toEqual(['p5']);
    expect(resolved.skipped).toBe(1);
  });
});

describe('fieldsForChanges', () => {
  const record = {
    id: 'r1',
    name: 'Max Mustermann',
    phone: '+43664111',
    email: 'max@ff.at',
    note: 'BFÜST-ND',
  };

  it('schreibt nur die angezeigten Felder', () => {
    // Sonst würde eine leere CSV-Spalte eine gepflegte Nummer löschen, obwohl
    // die Vorschau sie nicht als Änderung ausweist.
    expect(fieldsForChanges(record, ['phone', 'note'])).toEqual({
      phone: '+43664111',
      note: 'BFÜST-ND',
    });
    expect(fieldsForChanges(record, [])).toEqual({});
  });

  it('schreibt alle vier Felder, wenn alle abweichen', () => {
    expect(
      fieldsForChanges(record, ['name', 'phone', 'email', 'note']),
    ).toEqual({
      name: 'Max Mustermann',
      phone: '+43664111',
      email: 'max@ff.at',
      note: 'BFÜST-ND',
    });
  });
});

describe('Notizen aus der Spalte comment', () => {
  it('übernimmt die Notiz beim Anlegen', () => {
    const plan = planPersonCsvImport(
      [
        {
          id: 'r1',
          name: 'Thomas Steiner',
          phone: '',
          email: '',
          note: 'FF Weiden am See',
        },
      ],
      [],
    );
    expect(plan.rows[0]).toMatchObject({
      action: 'create',
      note: 'FF Weiden am See',
    });
  });

  it('bietet eine geänderte Notiz zur Aktualisierung an', () => {
    const plan = planPersonCsvImport(
      [
        {
          id: 'r1',
          name: 'Peter Kroiss',
          phone: '',
          email: '',
          note: 'BFÜST-ND',
        },
      ],
      [
        person({
          id: 'p1',
          name: 'Peter Kroiss',
          blaulichtSmsRecipientId: 'r1',
          note: 'alte Notiz',
        }),
      ],
    );
    expect(plan.rows[0]).toMatchObject({ action: 'update' });
    expect(plan.rows[0].changes).toEqual(['note']);
  });

  it('löscht eine gepflegte Notiz nicht, wenn die CSV-Spalte leer ist', () => {
    const plan = planPersonCsvImport(
      [{ id: 'r1', name: 'Peter Kroiss', phone: '', email: '', note: '' }],
      [
        person({
          id: 'p1',
          name: 'Peter Kroiss',
          blaulichtSmsRecipientId: 'r1',
          note: 'handgepflegt',
        }),
      ],
    );
    expect(plan.rows[0].action).toBe('unchanged');
  });
});
