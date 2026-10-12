import { describe, expect, it } from 'vitest';
import type { ImportPreview } from '../../common/bekleidungImport';
import {
  AS_LAGER,
  CREATE_PERSON,
  CREATE_PERSON_INACTIVE,
  personDecisions,
} from './ImportPersonsSection';

const person = (key: string, vorname: string, nachname: string) => ({
  key,
  vorname,
  nachname,
  openCount: 1,
  match: { status: 'new' as const, candidates: [] },
});

const preview = {
  persons: [
    person('max mustermann', 'Max', 'Mustermann'),
    person('erika musterfrau', 'Erika', 'Musterfrau'),
    person('kaputt achtung!', 'Achtung!', 'kaputt'),
    person('anna a', 'Anna', 'A'),
  ],
} as unknown as ImportPreview;

describe('personDecisions', () => {
  it('übersetzt die Auswahl je Person, auch „ist ein Lager"', () => {
    expect(
      personDecisions(preview, {
        'max mustermann': 'p1',
        'erika musterfrau': CREATE_PERSON,
        'kaputt achtung!': AS_LAGER,
        'anna a': CREATE_PERSON_INACTIVE,
      }),
    ).toEqual({
      'max mustermann': { personId: 'p1' },
      'erika musterfrau': { create: 'Erika Musterfrau' },
      'kaputt achtung!': { lagerort: 'Achtung! kaputt' },
      'anna a': { create: 'Anna A', active: false },
    });
  });
});
