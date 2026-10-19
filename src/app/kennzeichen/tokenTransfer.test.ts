import { describe, expect, it } from 'vitest';
import { planTokenTransferRoles } from './tokenTransfer';

describe('planTokenTransferRoles', () => {
  it('vergibt die Rolle an die Mitglieder der Quellgruppe, die auch in der Zielgruppe sind', () => {
    const plan = planTokenTransferRoles(
      [
        { uid: 'a', groupRoles: { kz: [], ffnd: [] } },
        { uid: 'b', groupRoles: { kz: ['kostenersatz'], ffnd: ['kennzeichenabfrage'] } },
        { uid: 'c', groupRoles: { kz: [] } },
        { uid: 'd', groupRoles: { ffnd: ['gruppenadmin'] } },
      ],
      'kz',
      'ffnd',
    );
    expect(plan).toEqual({
      grant: ['a'],
      alreadyGranted: ['b'],
      notMember: ['c'],
    });
  });
});
