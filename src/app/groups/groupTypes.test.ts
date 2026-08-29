import { describe, expect, it } from 'vitest';
import { ApiException } from '../api/errors';
import { assertTenantGroup, NON_TENANT_GROUP_IDS } from './groupTypes';

describe('assertTenantGroup', () => {
  it('lässt eine echte Mandantengruppe durch', () => {
    expect(() => assertTenantGroup('ffnd')).not.toThrow();
  });

  it('lehnt eine leere Gruppen-ID ab', () => {
    expect(() => assertTenantGroup('')).toThrow(/groupId missing/);
  });

  it('lehnt jede Nicht-Mandanten-Gruppe ab', () => {
    for (const groupId of NON_TENANT_GROUP_IDS) {
      expect(() => assertTenantGroup(groupId)).toThrow(
        new RegExp(`${groupId} is not a valid group`),
      );
    }
  });

  it('meldet Ablehnungen als 400', () => {
    for (const groupId of ['', ...NON_TENANT_GROUP_IDS]) {
      try {
        assertTenantGroup(groupId);
        expect.unreachable(`${groupId || '<empty>'} should be rejected`);
      } catch (err) {
        expect(err).toBeInstanceOf(ApiException);
        expect((err as ApiException).status).toBe(400);
      }
    }
  });
});
