import { describe, expect, it } from 'vitest';
import { claimGroupsKey } from './claimGroups';

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
