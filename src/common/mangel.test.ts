import { describe, expect, it } from 'vitest';
import {
  appendMangelNote,
  applyMangelStatus,
  buildMangelDocument,
  isOpenMangel,
  openMangelCount,
  validateMangelInput,
  type Mangel,
  type MangelActor,
} from './mangel';

const actor: MangelActor = {
  userId: 'u1',
  userName: 'Anna Muster',
  now: '2026-08-07T10:00:00.000Z',
};

function mangel(overrides: Partial<Mangel> = {}): Mangel {
  return {
    id: 'm1',
    vehicleId: 'v1',
    vehicleName: 'TLF-A',
    description: 'Blinker hinten links defekt',
    status: 'open',
    notes: [],
    reportedAt: '2026-08-01T08:00:00.000Z',
    reportedBy: 'u9',
    reportedByName: 'Bernd Beispiel',
    group: 'ffn',
    createdAt: '2026-08-01T08:00:00.000Z',
    createdBy: 'u9',
    updatedAt: '2026-08-01T08:00:00.000Z',
    updatedBy: 'u9',
    ...overrides,
  };
}

describe('validateMangelInput', () => {
  it('accepts a complete input', () => {
    expect(
      validateMangelInput({ vehicleId: 'v1', description: 'Kupplung rutscht' }),
    ).toEqual([]);
  });

  it('requires a vehicle', () => {
    expect(
      validateMangelInput({ vehicleId: '  ', description: 'Kupplung rutscht' }),
    ).toContain('vehicleMissing');
  });

  it('requires a description — a Mangel without one says nothing', () => {
    expect(
      validateMangelInput({ vehicleId: 'v1', description: '   ' }),
    ).toContain('descriptionMissing');
  });

  it('rejects an unknown status', () => {
    expect(
      validateMangelInput({
        vehicleId: 'v1',
        description: 'x',
        status: 'irgendwas',
      }),
    ).toContain('statusInvalid');
  });

  it('rejects an unparseable reportedAt', () => {
    expect(
      validateMangelInput({
        vehicleId: 'v1',
        description: 'x',
        reportedAt: 'übermorgen',
      }),
    ).toContain('reportedAtInvalid');
  });
});

describe('buildMangelDocument', () => {
  it('takes the vehicle name from the vehicle document, not the input', () => {
    const doc = buildMangelDocument(
      { vehicleId: 'v1', description: '  Blinker defekt  ' },
      { name: 'TLF-A' },
      'ffn',
      actor,
    );
    expect(doc.vehicleName).toBe('TLF-A');
    expect(doc.description).toBe('Blinker defekt');
  });

  it('defaults to status open and an empty note history', () => {
    const doc = buildMangelDocument(
      { vehicleId: 'v1', description: 'Blinker defekt' },
      { name: 'TLF-A' },
      'ffn',
      actor,
    );
    expect(doc.status).toBe('open');
    expect(doc.notes).toEqual([]);
    expect(doc.resolvedAt).toBeUndefined();
  });

  it('sets the system fields from the actor', () => {
    const doc = buildMangelDocument(
      { vehicleId: 'v1', description: 'Blinker defekt' },
      { name: 'TLF-A' },
      'ffn',
      actor,
    );
    expect(doc).toMatchObject({
      group: 'ffn',
      reportedAt: actor.now,
      reportedBy: 'u1',
      reportedByName: 'Anna Muster',
      createdAt: actor.now,
      createdBy: 'u1',
      updatedAt: actor.now,
      updatedBy: 'u1',
    });
  });

  it('keeps an explicit reportedAt — a Mangel from a trip is as old as the trip', () => {
    const doc = buildMangelDocument(
      {
        vehicleId: 'v1',
        description: 'Blinker defekt',
        reportedAt: '2026-07-01T06:00:00.000Z',
        reportedByName: 'Bernd Beispiel',
      },
      { name: 'TLF-A' },
      'ffn',
      actor,
    );
    expect(doc.reportedAt).toBe('2026-07-01T06:00:00.000Z');
    expect(doc.reportedByName).toBe('Bernd Beispiel');
    // Die Systemspur bleibt beim Aufrufer — wer den Datensatz geschrieben hat,
    // ist eine andere Frage als wer den Mangel gemeldet hat.
    expect(doc.createdAt).toBe(actor.now);
    expect(doc.createdBy).toBe('u1');
  });

  it('keeps the reporting entry when given', () => {
    const doc = buildMangelDocument(
      { vehicleId: 'v1', description: 'x', entryId: 'e1' },
      { name: 'TLF-A' },
      'ffn',
      actor,
    );
    expect(doc.entryId).toBe('e1');
  });

  it('omits entryId instead of writing undefined — Firestore rejects it', () => {
    const doc = buildMangelDocument(
      { vehicleId: 'v1', description: 'x' },
      { name: 'TLF-A' },
      'ffn',
      actor,
    );
    expect('entryId' in doc).toBe(false);
  });

  it('throws on invalid input', () => {
    expect(() =>
      buildMangelDocument(
        { vehicleId: 'v1', description: '   ' },
        { name: 'TLF-A' },
        'ffn',
        actor,
      ),
    ).toThrow(/descriptionMissing/);
  });
});

describe('applyMangelStatus', () => {
  it('sets resolvedAt to now when resolving', () => {
    const patch = applyMangelStatus(mangel(), 'resolved', actor);
    expect(patch.status).toBe('resolved');
    expect(patch.resolvedAt).toBe(actor.now);
  });

  it('accepts a corrected resolvedAt — a Mangel fixed last week is entered today', () => {
    const patch = applyMangelStatus(mangel(), 'resolved', actor, {
      resolvedAt: '2026-08-03T12:00:00.000Z',
    });
    expect(patch.resolvedAt).toBe('2026-08-03T12:00:00.000Z');
  });

  it('rejects an unparseable resolvedAt', () => {
    expect(() =>
      applyMangelStatus(mangel(), 'resolved', actor, {
        resolvedAt: 'letzte Woche',
      }),
    ).toThrow(/resolvedAtInvalid/);
  });

  it('clears resolvedAt when reopening — an open Mangel has no fix date', () => {
    const patch = applyMangelStatus(
      mangel({ status: 'resolved', resolvedAt: '2026-08-05T00:00:00.000Z' }),
      'inProgress',
      actor,
    );
    expect(patch.status).toBe('inProgress');
    expect(patch.resolvedAt).toBeNull();
  });

  it('records the status change in the note history', () => {
    const patch = applyMangelStatus(mangel(), 'inProgress', actor);
    expect(patch.notes).toEqual([
      {
        text: '',
        status: 'inProgress',
        at: actor.now,
        by: 'u1',
        byName: 'Anna Muster',
      },
    ]);
  });

  it('appends to an existing history instead of replacing it', () => {
    const existing = mangel({
      notes: [
        {
          text: 'Werkstatttermin am 12.8.',
          at: '2026-08-02T00:00:00.000Z',
          by: 'u9',
          byName: 'Bernd Beispiel',
        },
      ],
    });
    const patch = applyMangelStatus(existing, 'inProgress', actor);
    expect(patch.notes).toHaveLength(2);
    expect(patch.notes[0].text).toBe('Werkstatttermin am 12.8.');
  });

  it('carries a note along with the status change as one entry', () => {
    const patch = applyMangelStatus(mangel(), 'resolved', actor, {
      note: '  Blinkerbirne getauscht  ',
    });
    expect(patch.notes).toHaveLength(1);
    expect(patch.notes[0]).toMatchObject({
      text: 'Blinkerbirne getauscht',
      status: 'resolved',
    });
  });

  it('rejects an unknown status', () => {
    expect(() =>
      applyMangelStatus(mangel(), 'erledigt' as never, actor),
    ).toThrow(/statusInvalid/);
  });

  it('records an unchanged status only when a note comes with it', () => {
    // Sonst füllte jedes Speichern des Dialogs den Verlauf mit leeren
    // „Status: offen"-Zeilen, obwohl niemand etwas geändert hat.
    const patch = applyMangelStatus(mangel(), 'open', actor);
    expect(patch.notes).toEqual([]);
    expect(patch.status).toBe('open');

    const withNote = applyMangelStatus(mangel(), 'open', actor, {
      note: 'Werkstatt kontaktiert',
    });
    expect(withNote.notes).toHaveLength(1);
    expect(withNote.notes[0].status).toBeUndefined();
  });

  it('keeps resolvedAt untouched when an already resolved Mangel gets a note', () => {
    const patch = applyMangelStatus(
      mangel({ status: 'resolved', resolvedAt: '2026-08-05T00:00:00.000Z' }),
      'resolved',
      actor,
      { note: 'Rechnung eingelangt' },
    );
    expect(patch.resolvedAt).toBeUndefined();
    expect(patch.notes).toHaveLength(1);
  });

  it('updates the modification trail', () => {
    const patch = applyMangelStatus(mangel(), 'inProgress', actor);
    expect(patch.updatedAt).toBe(actor.now);
    expect(patch.updatedBy).toBe('u1');
  });
});

describe('appendMangelNote', () => {
  it('appends a note with author and timestamp', () => {
    const patch = appendMangelNote(mangel(), '  Ersatzteil bestellt  ', actor);
    expect(patch.notes).toEqual([
      {
        text: 'Ersatzteil bestellt',
        at: actor.now,
        by: 'u1',
        byName: 'Anna Muster',
      },
    ]);
    expect(patch.updatedAt).toBe(actor.now);
  });

  it('rejects an empty note', () => {
    expect(() => appendMangelNote(mangel(), '   ', actor)).toThrow(
      /noteMissing/,
    );
  });
});

describe('isOpenMangel / openMangelCount', () => {
  it('counts open and in-progress, not resolved', () => {
    expect(isOpenMangel(mangel({ status: 'open' }))).toBe(true);
    expect(isOpenMangel(mangel({ status: 'inProgress' }))).toBe(true);
    expect(isOpenMangel(mangel({ status: 'resolved' }))).toBe(false);

    expect(
      openMangelCount([
        mangel({ status: 'open' }),
        mangel({ status: 'inProgress' }),
        mangel({ status: 'resolved' }),
      ]),
    ).toBe(2);
  });

  it('treats a missing status as open — a Mangel is not silently resolved', () => {
    expect(isOpenMangel(mangel({ status: undefined as never }))).toBe(true);
  });
});
