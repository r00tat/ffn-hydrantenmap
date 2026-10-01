import { describe, expect, it } from 'vitest';
import type { CrewAssignment } from '../components/firebase/firestore';
import {
  collectConfirmedPersons,
  collectUnconfirmedRecipients,
  CrewRecipient,
  planCrewSync,
  visibleCrewAssignments,
} from './crewMerge';

const alarm = (...recipients: CrewRecipient[]) => ({ recipients });
const yes = (id: string, name: string): CrewRecipient => ({
  id,
  name,
  participation: 'yes',
});
const no = (id: string, name: string): CrewRecipient => ({
  id,
  name,
  participation: 'no',
});

const crew = (
  id: string,
  recipientId: string,
  name: string,
  extra: Partial<CrewAssignment> = {},
): CrewAssignment => ({
  id,
  recipientId,
  name,
  vehicleId: null,
  vehicleName: '',
  funktion: 'Feuerwehrmann',
  source: 'alarm',
  ...extra,
});

describe('collectConfirmedPersons', () => {
  it('führt dieselbe Person aus zwei Alarmen unter verschiedenen IDs zusammen', () => {
    const persons = collectConfirmedPersons([
      alarm(yes('a1-max', 'Mustermann Max')),
      alarm(yes('a2-max', 'Mustermann Max'), yes('a2-eva', 'Muster Eva')),
    ]);
    expect(persons).toHaveLength(2);
    expect(persons[0]).toMatchObject({
      id: 'a1-max',
      name: 'Mustermann Max',
      ids: ['a1-max', 'a2-max'],
    });
    expect(persons[1]).toMatchObject({ id: 'a2-eva', ids: ['a2-eva'] });
  });

  it('erkennt die Person auch bei gedrehtem Namen', () => {
    const persons = collectConfirmedPersons([
      alarm(yes('a1', 'Mustermann Max')),
      alarm(yes('a2', 'Max Mustermann')),
    ]);
    expect(persons).toHaveLength(1);
  });

  it('hält gleichnamige Empfänger desselben Alarms getrennt', () => {
    const persons = collectConfirmedPersons([
      alarm(yes('x1', 'Muster Hans'), yes('x2', 'Muster Hans')),
      alarm(yes('y1', 'Muster Hans'), yes('y2', 'Muster Hans')),
    ]);
    expect(persons).toHaveLength(2);
    expect(persons.map((p) => p.ids)).toEqual([
      ['x1', 'y1'],
      ['x2', 'y2'],
    ]);
  });
});

describe('planCrewSync', () => {
  const persons = collectConfirmedPersons([
    alarm(yes('a1-max', 'Mustermann Max'), yes('a1-eva', 'Muster Eva')),
    alarm(yes('a2-max', 'Mustermann Max'), yes('a2-eva', 'Muster Eva')),
  ]);

  it('legt eine Person aus zwei Alarmen nur einmal an', () => {
    const plan = planCrewSync([], persons);
    expect(plan.create.map((p) => p.id)).toEqual(['a1-max', 'a1-eva']);
  });

  it('legt nichts an, wenn die Person unter der ID des anderen Alarms schon steht', () => {
    const plan = planCrewSync(
      [
        { id: 'd1', data: crew('d1', 'a2-max', 'Mustermann Max') },
        { id: 'd2', data: crew('d2', 'a2-eva', 'Muster Eva') },
      ],
      persons,
    );
    expect(plan).toEqual({ deleteIds: [], updates: [], create: [] });
  });

  it('löst ein bestehendes Duplikat auf und behält den bearbeiteten Eintrag', () => {
    const plan = planCrewSync(
      [
        { id: 'd1', data: crew('d1', 'a1-max', 'Mustermann Max') },
        {
          id: 'd2',
          data: crew('d2', 'a2-max', 'Mustermann Max', {
            vehicleId: 'v1',
            vehicleName: 'TLFA',
            funktion: 'Maschinist',
          }),
        },
        {
          id: 'd3',
          data: crew('d3', 'a1-eva', 'Muster Eva', {
            funktion: 'Atemschutzträger',
          }),
        },
        { id: 'd4', data: crew('d4', 'a2-eva', 'Muster Eva') },
      ],
      persons,
    );
    expect(plan.deleteIds.sort()).toEqual(['d1', 'd4']);
    expect(plan.updates).toEqual([]);
    expect(plan.create).toEqual([]);
  });

  it('übernimmt Fahrzeug und Funktion verteilter Duplikate auf den behaltenen Eintrag', () => {
    const plan = planCrewSync(
      [
        {
          id: 'd1',
          data: crew('d1', 'a1-max', 'Mustermann Max', {
            funktion: 'Gruppenkommandant',
          }),
        },
        {
          id: 'd2',
          data: crew('d2', 'a2-max', 'Mustermann Max', {
            vehicleId: 'v1',
            vehicleName: 'TLFA',
          }),
        },
      ],
      persons,
    );
    expect(plan.deleteIds).toEqual(['d1']);
    expect(plan.updates).toEqual([
      { id: 'd2', changes: { funktion: 'Gruppenkommandant' } },
    ]);
  });

  it('räumt weiterhin Duplikate mit gleicher ID auf', () => {
    const plan = planCrewSync(
      [
        { id: 'd1', data: crew('d1', 'old', 'Beispiel Otto') },
        {
          id: 'd2',
          data: crew('d2', 'old', 'Beispiel Otto', { vehicleId: 'v2' }),
        },
      ],
      persons,
    );
    expect(plan.deleteIds).toEqual(['d1']);
  });

  it('findet einen von Hand angelegten Eintrag über den Namen wieder', () => {
    const plan = planCrewSync(
      [
        {
          id: 'd1',
          data: crew('d1', 'manual-1', 'Max Mustermann', { source: 'manual' }),
        },
      ],
      persons,
    );
    expect(plan.create.map((p) => p.id)).toEqual(['a1-eva']);
  });
});

describe('visibleCrewAssignments', () => {
  const alarms = [
    alarm(yes('a1-max', 'Mustermann Max'), no('a1-eva', 'Muster Eva')),
    alarm(yes('a2-max', 'Mustermann Max'), yes('a2-eva', 'Muster Eva')),
  ];

  it('zeigt einen Eintrag, dessen ID nur im anderen Alarm zugesagt hat', () => {
    const visible = visibleCrewAssignments(
      [crew('d1', 'a1-eva', 'Muster Eva', { vehicleId: 'v1' })],
      alarms,
    );
    expect(visible.map((a) => a.id)).toEqual(['d1']);
  });

  it('zeigt eine Person nur einmal, und zwar den bearbeiteten Eintrag', () => {
    const visible = visibleCrewAssignments(
      [
        crew('d1', 'a1-max', 'Mustermann Max'),
        crew('d2', 'a2-max', 'Mustermann Max', { vehicleId: 'v1' }),
      ],
      alarms,
    );
    expect(visible.map((a) => a.id)).toEqual(['d2']);
  });

  it('blendet einen Alarm-Eintrag ohne Zusage aus, von Hand angelegte nicht', () => {
    const visible = visibleCrewAssignments(
      [
        crew('d1', 'gone', 'Beispiel Otto'),
        crew('d2', 'manual-1', 'Beispiel Ida', { source: 'manual' }),
      ],
      alarms,
    );
    expect(visible.map((a) => a.id)).toEqual(['d2']);
  });

  it('zeigt ohne Alarme alle Einträge, je ID einmal', () => {
    const visible = visibleCrewAssignments(
      [
        crew('d1', 'r1', 'Beispiel Otto'),
        crew('d2', 'r1', 'Beispiel Otto'),
        crew('d3', 'r2', 'Beispiel Ida'),
      ],
      null,
    );
    expect(visible.map((a) => a.id)).toEqual(['d1', 'd3']);
  });
});

describe('collectUnconfirmedRecipients', () => {
  it('bietet niemanden an, der in einem anderen Alarm zugesagt hat', () => {
    const result = collectUnconfirmedRecipients(
      [
        alarm(no('a1-max', 'Mustermann Max'), no('a1-ida', 'Beispiel Ida')),
        alarm(yes('a2-max', 'Mustermann Max'), no('a2-ida', 'Beispiel Ida')),
      ],
      [],
    );
    expect(result).toEqual([
      { id: 'a1-ida', name: 'Beispiel Ida', participation: 'no' },
    ]);
  });

  it('bietet niemanden an, der unter anderer ID schon in der Besatzung steht', () => {
    const result = collectUnconfirmedRecipients(
      [alarm(no('a2-ida', 'Beispiel Ida'))],
      [crew('d1', 'a1-ida', 'Ida Beispiel', { source: 'manual' })],
    );
    expect(result).toEqual([]);
  });
});
