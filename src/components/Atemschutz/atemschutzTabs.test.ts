import { describe, expect, it } from 'vitest';
import {
  ATEMSCHUTZ_TABS,
  isAtemschutzTabKey,
  tabFromParam,
} from './atemschutzTabs';

describe('tabFromParam', () => {
  it('nimmt jeden gültigen Reiter an', () => {
    for (const key of ATEMSCHUTZ_TABS) {
      expect(tabFromParam(key)).toBe(key);
    }
  });

  it('fällt ohne Parameter auf den ersten Reiter zurück', () => {
    expect(tabFromParam(null)).toBe('fuellprotokoll');
    expect(tabFromParam(undefined)).toBe('fuellprotokoll');
    expect(tabFromParam('')).toBe('fuellprotokoll');
  });

  it('fällt bei einem unbekannten Wert auf den ersten Reiter zurück', () => {
    // Der Wert steht in der URL und damit in jedem weitergegebenen Link.
    expect(tabFromParam('gibtsnicht')).toBe('fuellprotokoll');
  });
});

describe('isAtemschutzTabKey', () => {
  it('unterscheidet gültige von ungültigen Werten', () => {
    expect(isAtemschutzTabKey('trupps')).toBe(true);
    expect(isAtemschutzTabKey('Trupps')).toBe(false);
    expect(isAtemschutzTabKey(null)).toBe(false);
  });
});
