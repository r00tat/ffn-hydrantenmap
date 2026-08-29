import { describe, expect, it, vi } from 'vitest';

// Zwei Import-Stubs, keine Verhaltens-Mocks: `server-only` wirft beim Import
// außerhalb einer Server-Umgebung, und `app/auth` zieht NextAuth samt Firebase
// Admin SDK nach. Geprüft wird nur die synchrone Gruppen-Sperre.
const actionUserRequiredMock = vi.hoisted(() => vi.fn());

vi.mock('server-only', () => ({}));
vi.mock('../../app/auth', () => ({
  actionUserRequired: actionUserRequiredMock,
}));

import { ApiException } from '../../app/api/errors';
import { NON_TENANT_GROUP_IDS } from '../../app/groups/groupTypes';
import {
  actionFahrtenbuchManagerRequired,
  assertFahrtenbuchGroup,
} from './authGuards';

describe('assertFahrtenbuchGroup', () => {
  it('lässt eine echte Mandantengruppe durch', () => {
    expect(() => assertFahrtenbuchGroup('ffnd')).not.toThrow();
  });

  it('lehnt eine leere Gruppen-ID ab', () => {
    expect(() => assertFahrtenbuchGroup('')).toThrow(/groupId missing/);
  });

  it('lehnt die Pseudo-Gruppe allUsers ab', () => {
    expect(() => assertFahrtenbuchGroup('allUsers')).toThrow(
      /allUsers is not a valid group/,
    );
  });

  it('lehnt die Berechtigungsgruppe kostenersatz ab', () => {
    expect(() => assertFahrtenbuchGroup('kostenersatz')).toThrow(
      /kostenersatz is not a valid group/,
    );
  });

  it('lehnt jede Nicht-Mandanten-Gruppe ab', () => {
    for (const groupId of NON_TENANT_GROUP_IDS) {
      expect(() => assertFahrtenbuchGroup(groupId)).toThrow(ApiException);
    }
  });

  it('meldet Ablehnungen als 400', () => {
    for (const groupId of ['', ...NON_TENANT_GROUP_IDS]) {
      try {
        assertFahrtenbuchGroup(groupId);
        expect.unreachable(`${groupId || '<empty>'} should be rejected`);
      } catch (err) {
        expect((err as ApiException).status).toBe(400);
      }
    }
  });
});

describe('actionFahrtenbuchManagerRequired', () => {
  it('lässt einen Admin durch', async () => {
    actionUserRequiredMock.mockResolvedValue({
      user: { id: 'a1', isAdmin: true, groups: ['allUsers'] },
    });
    await expect(
      actionFahrtenbuchManagerRequired('ffnd'),
    ).resolves.toBeDefined();
  });

  it('lässt einen Gerätemeister der Gruppe durch', async () => {
    actionUserRequiredMock.mockResolvedValue({
      user: {
        id: 'g1',
        isAdmin: false,
        groups: ['ffnd'],
        fahrtenbuchGeraetemeister: ['ffnd'],
      },
    });
    await expect(
      actionFahrtenbuchManagerRequired('ffnd'),
    ).resolves.toBeDefined();
  });

  it('weist ein einfaches Gruppenmitglied ab', async () => {
    actionUserRequiredMock.mockResolvedValue({
      user: { id: 'u1', isAdmin: false, groups: ['ffnd'] },
    });
    await expect(actionFahrtenbuchManagerRequired('ffnd')).rejects.toThrow();
  });

  it('weist eine Nicht-Mandanten-Gruppe ab, auch beim Admin', async () => {
    actionUserRequiredMock.mockResolvedValue({
      user: { id: 'a1', isAdmin: true, groups: ['allUsers'] },
    });
    await expect(
      actionFahrtenbuchManagerRequired('kostenersatz'),
    ).rejects.toThrow();
  });
});
