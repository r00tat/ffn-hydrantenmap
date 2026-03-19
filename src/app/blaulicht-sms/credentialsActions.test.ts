import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('../auth', () => ({
  actionUserRequired: vi.fn(),
  actionAdminRequired: vi.fn(),
}));
vi.mock('../../server/firebase/admin', () => ({
  firestore: { collection: vi.fn() },
}));
vi.mock('../../server/blaulichtsms/encryption', () => ({
  encryptPassword: vi.fn(),
}));

import { appendLegacyGroup } from './credentialsActions';

describe('appendLegacyGroup', () => {
  beforeEach(() => {
    delete process.env.BLAULICHTSMS_REQUIRED_GROUP;
    delete process.env.BLAULICHTSMS_USERNAME;
    delete process.env.BLAULICHTSMS_PASSWORD;
    delete process.env.BLAULICHTSMS_CUSTOMER_ID;
  });

  it('appends ffnd when legacy env vars are set and not in Firestore', () => {
    process.env.BLAULICHTSMS_USERNAME = 'user';
    process.env.BLAULICHTSMS_PASSWORD = 'pass';
    process.env.BLAULICHTSMS_CUSTOMER_ID = 'cust';

    const result = appendLegacyGroup(['other-group']);
    expect(result).toEqual(['other-group', 'ffnd']);
  });

  it('uses custom BLAULICHTSMS_REQUIRED_GROUP env var', () => {
    process.env.BLAULICHTSMS_REQUIRED_GROUP = 'custom-group';
    process.env.BLAULICHTSMS_USERNAME = 'user';
    process.env.BLAULICHTSMS_PASSWORD = 'pass';
    process.env.BLAULICHTSMS_CUSTOMER_ID = 'cust';

    const result = appendLegacyGroup([]);
    expect(result).toEqual(['custom-group']);
  });

  it('does not duplicate group already in Firestore list', () => {
    process.env.BLAULICHTSMS_USERNAME = 'user';
    process.env.BLAULICHTSMS_PASSWORD = 'pass';
    process.env.BLAULICHTSMS_CUSTOMER_ID = 'cust';

    const result = appendLegacyGroup(['ffnd', 'other']);
    expect(result).toEqual(['ffnd', 'other']);
  });

  it('does not append when env vars are incomplete', () => {
    process.env.BLAULICHTSMS_USERNAME = 'user';
    // missing PASSWORD and CUSTOMER_ID

    const result = appendLegacyGroup([]);
    expect(result).toEqual([]);
  });

  it('does not append when no env vars are set', () => {
    const result = appendLegacyGroup(['some-group']);
    expect(result).toEqual(['some-group']);
  });

  it('does not mutate the input array', () => {
    process.env.BLAULICHTSMS_USERNAME = 'user';
    process.env.BLAULICHTSMS_PASSWORD = 'pass';
    process.env.BLAULICHTSMS_CUSTOMER_ID = 'cust';

    const input = ['other'];
    appendLegacyGroup(input);
    expect(input).toEqual(['other']);
  });
});
