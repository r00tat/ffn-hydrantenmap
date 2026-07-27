import { describe, it, expect } from 'vitest';
import {
  findExistingFirecallsForAlarms,
  type ExistingFirecall,
} from './duplicateFirecallCheck';

const map = (
  entries: Record<string, ExistingFirecall>,
): Record<string, ExistingFirecall> => entries;

describe('findExistingFirecallsForAlarms', () => {
  it('returns nothing when no alarm ids are selected', () => {
    expect(
      findExistingFirecallsForAlarms([], map({ a1: { id: 'f1', name: 'X' } })),
    ).toEqual([]);
  });

  it('returns nothing when none of the alarms has a firecall yet', () => {
    expect(
      findExistingFirecallsForAlarms(
        ['a1', 'a2'],
        map({ a9: { id: 'f9', name: 'Anderer' } }),
      ),
    ).toEqual([]);
  });

  it('returns the firecall already linked to the selected alarm', () => {
    expect(
      findExistingFirecallsForAlarms(
        ['a1'],
        map({ a1: { id: 'f1', name: 'G1 Ölspur' } }),
      ),
    ).toEqual([{ id: 'f1', name: 'G1 Ölspur' }]);
  });

  it('de-duplicates a firecall that is linked to several selected alarms', () => {
    // A firecall with a Nachalarm links more than one alarm id — it must be
    // reported once, not once per alarm.
    expect(
      findExistingFirecallsForAlarms(
        ['a1', 'a2'],
        map({
          a1: { id: 'f1', name: 'G1 Ölspur' },
          a2: { id: 'f1', name: 'G1 Ölspur' },
        }),
      ),
    ).toEqual([{ id: 'f1', name: 'G1 Ölspur' }]);
  });

  it('reports several distinct firecalls', () => {
    const found = findExistingFirecallsForAlarms(
      ['a1', 'a2'],
      map({
        a1: { id: 'f1', name: 'Erster' },
        a2: { id: 'f2', name: 'Zweiter' },
      }),
    );

    expect(found).toHaveLength(2);
    expect(found.map((f) => f.id)).toEqual(['f1', 'f2']);
  });

  it('excludes the firecall currently being edited', () => {
    // Editing an existing firecall must not warn about the firecall itself.
    expect(
      findExistingFirecallsForAlarms(
        ['a1'],
        map({ a1: { id: 'f1', name: 'G1 Ölspur' } }),
        'f1',
      ),
    ).toEqual([]);
  });

  it('still reports a foreign firecall while editing', () => {
    expect(
      findExistingFirecallsForAlarms(
        ['a1', 'a2'],
        map({
          a1: { id: 'f1', name: 'Eigener' },
          a2: { id: 'f2', name: 'Fremder' },
        }),
        'f1',
      ),
    ).toEqual([{ id: 'f2', name: 'Fremder' }]);
  });

  it('ignores entries without a usable id', () => {
    expect(
      findExistingFirecallsForAlarms(
        ['a1'],
        map({ a1: { id: '', name: 'Ohne Id' } }),
      ),
    ).toEqual([]);
  });
});
