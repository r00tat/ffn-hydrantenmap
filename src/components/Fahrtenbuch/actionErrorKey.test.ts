import { describe, expect, it } from 'vitest';
import { ApiException } from '../../app/api/errors';
import { actionErrorKey } from './actionErrorKey';

describe('actionErrorKey', () => {
  it('übersetzt die fehlende Mitgliedschaft', () => {
    expect(
      actionErrorKey(
        new ApiException('user is not a member of group ffnd', { status: 403 }),
      ),
    ).toBe('notInGroup');
  });

  it('übersetzt fehlendes gruppe.manage in notGroupAdmin', () => {
    expect(
      actionErrorKey(
        new ApiException('user lacks gruppe.manage in group ffnd', {
          status: 403,
        }),
      ),
    ).toBe('notGroupAdmin');
  });

  it('übersetzt jedes andere fehlende Recht in notPermitted, nicht in notLoggedIn', () => {
    expect(
      actionErrorKey(
        new ApiException('user lacks kostenersatz.use in group ffnd', {
          status: 403,
        }),
      ),
    ).toBe('notPermitted');
    expect(
      actionErrorKey(
        new ApiException('user lacks kostenersatz.use for firecall f1', {
          status: 403,
        }),
      ),
    ).toBe('notPermitted');
  });

  it('meldet eine sonstige 403 als nicht angemeldet', () => {
    expect(
      actionErrorKey(new ApiException('Nicht freigeschaltet', { status: 403 })),
    ).toBe('notLoggedIn');
  });

  it('gibt eine unbekannte Meldung unverändert zurück', () => {
    expect(actionErrorKey(new Error('kaputt'))).toBe('kaputt');
  });
});
