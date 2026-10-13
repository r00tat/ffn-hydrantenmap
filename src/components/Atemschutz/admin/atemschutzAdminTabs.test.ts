import { describe, expect, it } from 'vitest';
import {
  ATEMSCHUTZ_ADMIN_TABS,
  adminTabFromParam,
  isAtemschutzAdminTabKey,
  visibleAdminTabs,
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

describe('visibleAdminTabs', () => {
  it('zeigt die Verrechnung nur mit kostenersatz.use', () => {
    // Die Einstellungen liegen in `atemschutzConfig`, das die Regeln nur mit
    // `kostenersatz.use` lesen lassen — ohne das Recht bliebe der Reiter leer.
    expect(visibleAdminTabs({ canManage: true, canBill: false })).toEqual([
      'geraete',
      'stammdaten',
    ]);
    expect(visibleAdminTabs({ canManage: true, canBill: true })).toEqual([
      ...ATEMSCHUTZ_ADMIN_TABS,
    ]);
  });

  it('zeigt mit kostenersatz.use allein nur die Verrechnung', () => {
    expect(visibleAdminTabs({ canManage: false, canBill: true })).toEqual(['rechnung']);
    expect(visibleAdminTabs({ canManage: false, canBill: false })).toEqual([]);
  });
});

describe('adminTabFromParam mit sichtbaren Reitern', () => {
  it('fällt auf den ersten sichtbaren Reiter zurück, wenn der Reiter nicht sichtbar ist', () => {
    expect(adminTabFromParam('rechnung', ['geraete', 'stammdaten'])).toBe('geraete');
    expect(adminTabFromParam('stammdaten', ['geraete', 'stammdaten'])).toBe('stammdaten');
    expect(adminTabFromParam('geraete', ['rechnung'])).toBe('rechnung');
    expect(adminTabFromParam(null, ['rechnung'])).toBe('rechnung');
  });
});
