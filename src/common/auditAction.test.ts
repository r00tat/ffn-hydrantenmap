import { describe, expect, it } from 'vitest';
import {
  auditActionForUpdate,
  changedFields,
  isRestorableAuditEntry,
  restoreData,
  sanitizeAuditValue,
} from './auditAction';

describe('auditActionForUpdate', () => {
  it('meldet ein Löschen als delete, nicht als update', () => {
    expect(auditActionForUpdate({ deleted: false }, { deleted: true })).toBe(
      'delete'
    );
  });

  it('meldet ein Löschen auch ohne bekannten Vorzustand als delete', () => {
    expect(auditActionForUpdate(undefined, { deleted: true })).toBe('delete');
  });

  it('meldet das Zurückholen eines gelöschten Elements als restore', () => {
    expect(auditActionForUpdate({ deleted: true }, { deleted: false })).toBe(
      'restore'
    );
    expect(auditActionForUpdate({ deleted: true }, {})).toBe('restore');
  });

  it('meldet eine Änderung an einem bereits gelöschten Element als update', () => {
    expect(auditActionForUpdate({ deleted: true }, { deleted: true })).toBe(
      'update'
    );
  });

  it('meldet eine gewöhnliche Änderung als update', () => {
    expect(auditActionForUpdate({}, { deleted: false })).toBe('update');
    expect(auditActionForUpdate(undefined, {})).toBe('update');
  });
});

describe('isRestorableAuditEntry', () => {
  const base = {
    timestamp: '2026-10-15T10:00:00.000Z',
    user: 'muster@example.com',
    elementType: 'marker',
    elementId: 'm1',
    elementName: 'Marker',
    previousValue: { name: 'Alt' },
  };

  it('erlaubt das Wiederherstellen von Änderungen und Löschungen', () => {
    expect(isRestorableAuditEntry({ ...base, action: 'update' })).toBe(true);
    expect(isRestorableAuditEntry({ ...base, action: 'delete' })).toBe(true);
  });

  it('erlaubt kein Wiederherstellen ohne Vorzustand', () => {
    expect(
      isRestorableAuditEntry({
        ...base,
        action: 'update',
        previousValue: undefined,
      })
    ).toBe(false);
  });

  it('erlaubt kein Wiederherstellen beim Anlegen', () => {
    expect(isRestorableAuditEntry({ ...base, action: 'create' })).toBe(false);
  });

  it('schließt Einträge aus, die keine Elemente des Einsatzes sind', () => {
    for (const elementType of ['firecall', 'location', 'kostenersatz', 'mapLayer']) {
      expect(
        isRestorableAuditEntry({ ...base, action: 'update', elementType })
      ).toBe(false);
    }
  });

  it('braucht eine Element-ID', () => {
    expect(
      isRestorableAuditEntry({ ...base, action: 'update', elementId: '' })
    ).toBe(false);
  });
});

describe('restoreData', () => {
  it('entfernt Felder, die nicht ins Dokument gehören, und setzt deleted zurück', () => {
    const data = restoreData(
      {
        id: 'm1',
        type: 'marker',
        name: 'Marker',
        deleted: true,
        deletedWithLayer: 'l1',
        original: { name: 'x' },
        eventHandlers: {},
        leer: undefined,
      } as never,
      { now: '2026-10-15T10:00:00.000Z', user: 'muster@example.com' }
    );
    expect(data).toEqual({
      type: 'marker',
      name: 'Marker',
      deleted: false,
      updatedAt: '2026-10-15T10:00:00.000Z',
      updatedBy: 'muster@example.com',
    });
  });
});

describe('sanitizeAuditValue', () => {
  it('entfernt undefined-Felder, auch verschachtelt', () => {
    expect(
      sanitizeAuditValue({
        name: 'Marker',
        rotation: undefined,
        original: undefined,
        fieldData: { a: 1, b: undefined },
      })
    ).toEqual({ name: 'Marker', fieldData: { a: 1 } });
  });

  it('entfernt Funktionen', () => {
    expect(sanitizeAuditValue({ a: 1, click: () => {} })).toEqual({ a: 1 });
  });

  it('schreibt verschachtelte Arrays als JSON', () => {
    expect(
      sanitizeAuditValue({
        positions: [
          [47.9, 16.8],
          [47.91, 16.81],
        ],
      })
    ).toEqual({ positions: ['[47.9,16.8]', '[47.91,16.81]'] });
  });

  it('übernimmt Klasseninstanzen als einfache Objekte', () => {
    class Punkt {
      constructor(
        public lat: number,
        public lng: number
      ) {}
    }
    expect(sanitizeAuditValue({ pos: new Punkt(1, 2) })).toEqual({
      pos: { lat: 1, lng: 2 },
    });
  });

  it('lässt Firestore-Typen unverändert', () => {
    class FakeTimestamp {
      seconds = 1;
      toDate() {
        return new Date(1000);
      }
    }
    const timestamp = new FakeTimestamp();
    expect(
      (sanitizeAuditValue({ t: timestamp }) as { t: unknown }).t
    ).toBe(timestamp);
  });
});

describe('changedFields', () => {
  it('liefert die geänderten Felder ohne Buchhaltungsfelder', () => {
    expect(
      changedFields(
        { name: 'Alt', lat: 1, beschreibung: 'x', updatedAt: 'a' },
        { name: 'Neu', lat: 1, rotation: '90', updatedAt: 'b' }
      )
    ).toEqual(['beschreibung', 'name', 'rotation']);
  });

  it('vergleicht verschachtelte Werte nach Inhalt', () => {
    expect(
      changedFields({ fieldData: { a: 1 } }, { fieldData: { a: 1 } })
    ).toEqual([]);
  });

  it('liefert nichts, wenn ein Stand fehlt', () => {
    expect(changedFields(undefined, { name: 'Neu' })).toEqual([]);
  });
});
