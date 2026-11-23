import { describe, expect, it } from 'vitest';
import type { PermissionUser } from '../permissions';
import {
  canManageRisikoObjekt,
  canSeeObjektPlans,
  checkGroupsChange,
  normalizeRisikoObjektInput,
  objektGroups,
  removeClusterEntry,
  storageGroupsMetadata,
  upsertClusterEntry,
} from './risikoobjektAccess';

const admin: PermissionUser = { isAdmin: true };
const mitgliedA: PermissionUser = { groupRoles: { a: [] } };
const adminA: PermissionUser = { groupRoles: { a: ['gruppenadmin'], b: [] } };
const adminAB: PermissionUser = { groupRoles: { a: ['gruppenadmin'], b: ['gruppenadmin'] } };

describe('objektGroups', () => {
  it('liefert nur Mandanten, eindeutig', () => {
    expect(objektGroups({ groups: ['a', 'allUsers', 'a', 'kostenersatz', 'b'] })).toEqual(['a', 'b']);
    expect(objektGroups({})).toEqual([]);
  });
});

describe('canSeeObjektPlans', () => {
  it('erlaubt Mitgliedern einer freigegebenen Gruppe', () => {
    expect(canSeeObjektPlans(mitgliedA, { groups: ['a'] })).toBe(true);
    expect(canSeeObjektPlans(mitgliedA, { groups: ['b'] })).toBe(false);
  });

  it('sperrt Objekte ohne Freigabe für alle außer dem Admin', () => {
    expect(canSeeObjektPlans(mitgliedA, {})).toBe(false);
    expect(canSeeObjektPlans(admin, {})).toBe(true);
  });

  it('zählt die Pseudo-Gruppe allUsers nicht als Freigabe', () => {
    expect(canSeeObjektPlans({ groupRoles: { allUsers: [] } }, { groups: ['allUsers'] })).toBe(false);
  });
});

describe('canManageRisikoObjekt', () => {
  it('verlangt risikoobjekte.manage in einer freigegebenen Gruppe', () => {
    expect(canManageRisikoObjekt(adminA, { groups: ['a'] })).toBe(true);
    expect(canManageRisikoObjekt(adminA, { groups: ['b'] })).toBe(false);
    expect(canManageRisikoObjekt(mitgliedA, { groups: ['a'] })).toBe(false);
    expect(canManageRisikoObjekt(admin, {})).toBe(true);
  });
});

describe('checkGroupsChange', () => {
  it('lässt den Admin alles ändern', () => {
    expect(checkGroupsChange(admin, ['a'], [])).toBe('ok');
  });

  it('erlaubt einem Gruppen-Admin nur Gruppen, in denen er das Recht hat', () => {
    expect(checkGroupsChange(adminAB, ['a'], ['a', 'b'])).toBe('ok');
    expect(checkGroupsChange(adminA, ['a'], ['a', 'b'])).toBe('forbidden');
    expect(checkGroupsChange(adminA, ['a', 'c'], ['a'])).toBe('forbidden');
  });

  it('lässt fremde Gruppen unangetastet stehen', () => {
    expect(checkGroupsChange(adminAB, ['a', 'c'], ['a', 'b', 'c'])).toBe('ok');
  });

  it('verbietet einem Gruppen-Admin, die letzte Freigabe zu entfernen', () => {
    expect(checkGroupsChange(adminA, ['a'], [])).toBe('empty');
  });

  it('weist Pseudo-Gruppen ab', () => {
    expect(checkGroupsChange(admin, [], ['allUsers'])).toBe('forbidden');
  });
});

describe('storageGroupsMetadata', () => {
  it('schreibt die Gruppen sortiert und eindeutig mit Komma', () => {
    expect(storageGroupsMetadata(['b', 'a', 'b'])).toBe('a,b');
    expect(storageGroupsMetadata([])).toBe('');
  });
});

describe('normalizeRisikoObjektInput', () => {
  const valid = {
    name: '  Lagerhalle ',
    ortschaft: 'ND',
    adresse: 'Industriestraße 1',
    risikogruppe: 'Lager',
    einsatzplanummer: '17',
    description: '',
    link: '',
    lat: 47.94,
    lng: 16.84,
  };

  it('kürzt Leerzeichen und übernimmt gültige Werte', () => {
    const result = normalizeRisikoObjektInput(valid);
    expect(result).toEqual({
      ok: true,
      value: expect.objectContaining({ name: 'Lagerhalle', lat: 47.94, lng: 16.84, link: '' }),
    });
  });

  it('verlangt einen Namen', () => {
    expect(normalizeRisikoObjektInput({ ...valid, name: ' ' })).toEqual({ ok: false, error: 'name' });
  });

  it('verlangt eine gültige Position', () => {
    expect(normalizeRisikoObjektInput({ ...valid, lat: Number.NaN })).toEqual({ ok: false, error: 'position' });
    expect(normalizeRisikoObjektInput({ ...valid, lng: 200 })).toEqual({ ok: false, error: 'position' });
  });

  it('nimmt als Link nur http(s)', () => {
    expect(normalizeRisikoObjektInput({ ...valid, link: 'javascript:alert(1)' })).toEqual({
      ok: false,
      error: 'link',
    });
    expect(normalizeRisikoObjektInput({ ...valid, link: 'https://drive.google.com/x' }).ok).toBe(true);
  });

  it('weist überlange Texte ab', () => {
    expect(normalizeRisikoObjektInput({ ...valid, description: 'x'.repeat(5001) })).toEqual({
      ok: false,
      error: 'tooLong',
    });
  });
});

describe('Cluster-Einträge', () => {
  const a = { id: 'a', name: 'A', lat: 1, lng: 1 };
  const b = { id: 'b', name: 'B', lat: 1, lng: 1 };

  it('ersetzt einen vorhandenen Eintrag und hängt neue an', () => {
    expect(upsertClusterEntry([a, b], { ...a, name: 'A2' })).toEqual([{ ...a, name: 'A2' }, b]);
    expect(upsertClusterEntry(undefined, a)).toEqual([a]);
  });

  it('entfernt einen Eintrag', () => {
    expect(removeClusterEntry([a, b], 'a')).toEqual([b]);
    expect(removeClusterEntry(undefined, 'a')).toEqual([]);
  });
});
