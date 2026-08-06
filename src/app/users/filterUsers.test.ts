import { describe, expect, it } from 'vitest';
import { UserRecordExtended } from '../../common/users';
import { defaultUserFilters, filterUsers } from './filterUsers';

function user(data: Partial<UserRecordExtended>): UserRecordExtended {
  return data as UserRecordExtended;
}

const member = user({
  uid: 'u1',
  displayName: 'Hans Huber',
  email: 'hans@ff-neusiedlamsee.at',
  feuerwehr: 'neusiedl',
  groups: ['ffnd', 'allUsers'],
});

const guestWrite = user({
  uid: 'u2',
  displayName: 'Nachbarwehr Weiden (Einsatz-Gast Brand)',
  email: 'firecall+fc1-abcd@ff-neusiedlamsee.at',
  groups: ['allUsers'],
  firecall: 'fc1',
  firecallWrite: true,
});

const guestReadOnly = user({
  uid: 'u3',
  displayName: 'ORF (Einsatz-Gast Brand)',
  email: 'firecall+fc1-efgh@ff-neusiedlamsee.at',
  groups: ['allUsers'],
  firecall: 'fc1',
  firecallWrite: false,
});

const users = [member, guestWrite, guestReadOnly];

describe('defaultUserFilters', () => {
  it('hides firecall guests by default', () => {
    expect(defaultUserFilters.showFirecallGuests).toBe(false);
  });
});

describe('filterUsers', () => {
  it('hides firecall guests unless they are requested', () => {
    expect(filterUsers(users, defaultUserFilters)).toEqual([member]);
  });

  it('includes firecall guests when requested', () => {
    expect(
      filterUsers(users, { ...defaultUserFilters, showFirecallGuests: true }),
    ).toEqual(users);
  });

  it('filters by name case-insensitively', () => {
    expect(
      filterUsers(users, { ...defaultUserFilters, name: 'huber' }),
    ).toEqual([member]);
  });

  it('combines the guest flag with the other filters', () => {
    expect(
      filterUsers(users, {
        ...defaultUserFilters,
        showFirecallGuests: true,
        name: 'orf',
      }),
    ).toEqual([guestReadOnly]);
  });

  it('filters by email, feuerwehr and groups', () => {
    expect(
      filterUsers(users, { ...defaultUserFilters, email: 'hans@' }),
    ).toEqual([member]);
    expect(
      filterUsers(users, { ...defaultUserFilters, feuerwehr: 'neusiedl' }),
    ).toEqual([member]);
    expect(
      filterUsers(users, { ...defaultUserFilters, groups: ['ffnd'] }),
    ).toEqual([member]);
    expect(
      filterUsers(users, { ...defaultUserFilters, groups: ['kostenersatz'] }),
    ).toEqual([]);
  });

  it('treats a user without a firecall as a regular user', () => {
    const withoutName = user({ uid: 'u4', email: 'x@example.org' });
    expect(filterUsers([withoutName], defaultUserFilters)).toEqual([
      withoutName,
    ]);
  });
});
