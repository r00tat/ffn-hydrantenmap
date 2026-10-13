import { describe, expect, it } from 'vitest';
import { claimGroupsKey, claimsNeedRefresh } from './claimGroups';

describe('claimGroupsKey', () => {
  it('vergleicht unabhängig von Reihenfolge und Dubletten', () => {
    expect(claimGroupsKey(['ffnd', 'allUsers', 'ffnd'])).toBe(
      claimGroupsKey(['allUsers', 'ffnd']),
    );
  });

  it('übergeht die Schein-Gruppe kostenersatz', () => {
    // Sie bleibt bis zum Schritt „Alte Felder entfernen" im Claim, steht aber
    // nicht mehr in der Sitzung — das ist kein veraltetes Token.
    expect(claimGroupsKey(['allUsers', 'ffnd', 'kostenersatz'])).toBe(
      claimGroupsKey(['allUsers', 'ffnd']),
    );
  });

  it('unterscheidet eine andere Mitgliedschaft', () => {
    expect(claimGroupsKey(['allUsers', 'ffnd'])).not.toBe(
      claimGroupsKey(['allUsers', 'ffxy']),
    );
    expect(claimGroupsKey(undefined)).toBe(claimGroupsKey([]));
  });
});

describe('claimsNeedRefresh', () => {
  const base = {
    sessionAuthorized: true,
    tokenAuthorized: true,
    sessionGroups: ['allUsers', 'ffnd'],
    tokenGroups: ['allUsers', 'ffnd'],
  };

  it('erneuert nichts, wenn Sitzung und Token übereinstimmen', () => {
    expect(claimsNeedRefresh({ ...base, rolesMigrated: true })).toBe(false);
  });

  it('erneuert bei abweichender Mitgliedschaft eines migrierten Benutzers', () => {
    expect(
      claimsNeedRefresh({ ...base, tokenGroups: ['allUsers'], rolesMigrated: true }),
    ).toBe(true);
  });

  it('erneuert nicht, solange der Benutzer nicht migriert ist', () => {
    // Die Sitzung kennt dann nur allUsers, der Claim die alten Gruppen; das
    // löst erst die Migration auf, kein neues Token und kein neuer Login.
    expect(
      claimsNeedRefresh({
        ...base,
        sessionGroups: ['allUsers'],
        rolesMigrated: false,
      }),
    ).toBe(false);
  });

  it('erneuert, wenn unbekannt ist, ob der Benutzer migriert ist', () => {
    expect(
      claimsNeedRefresh({ ...base, sessionGroups: ['allUsers'], rolesMigrated: undefined }),
    ).toBe(true);
  });

  it('erneuert bei abweichender Freischaltung auch vor der Migration', () => {
    expect(
      claimsNeedRefresh({ ...base, tokenAuthorized: false, rolesMigrated: false }),
    ).toBe(true);
  });
});
