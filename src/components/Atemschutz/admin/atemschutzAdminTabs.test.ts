import { describe, expect, it } from 'vitest';
import {
  ATEMSCHUTZ_ADMIN_TABS,
  adminTabFromParam,
  isAtemschutzAdminTabKey,
} from './atemschutzAdminTabs';

describe('adminTabFromParam', () => {
  it('nimmt einen bekannten Reiter', () => {
    expect(adminTabFromParam('rechnung')).toBe('rechnung');
    expect(adminTabFromParam('geraete')).toBe('geraete');
  });

  it('fällt bei Unsinn auf den ersten Reiter zurück', () => {
    expect(adminTabFromParam('gibtsnicht')).toBe('geraete');
    expect(adminTabFromParam(null)).toBe('geraete');
    expect(adminTabFromParam(undefined)).toBe('geraete');
    expect(adminTabFromParam('')).toBe('geraete');
  });
});

describe('isAtemschutzAdminTabKey', () => {
  it('erkennt genau die vorhandenen Reiter', () => {
    for (const key of ATEMSCHUTZ_ADMIN_TABS) {
      expect(isAtemschutzAdminTabKey(key)).toBe(true);
    }
    expect(isAtemschutzAdminTabKey('fuellprotokoll')).toBe(false);
  });
});
