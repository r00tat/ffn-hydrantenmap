import { describe, expect, it } from 'vitest';
import { isObjektArt, isObjektRef, OBJEKT_ARTEN, tagObjekte } from './objektArt';

describe('objektArt', () => {
  it('kennt Risikoobjekte und gefährdete Objekte', () => {
    expect(OBJEKT_ARTEN).toEqual(['risikoobjekt', 'gefahrobjekt']);
  });

  it('lässt nur bekannte Arten zu — sie werden Teil eines Firestore-Pfads', () => {
    expect(isObjektArt('risikoobjekt')).toBe(true);
    expect(isObjektArt('gefahrobjekt')).toBe(true);
    expect(isObjektArt('call')).toBe(false);
    expect(isObjektArt('risikoobjekt/x')).toBe(false);
    expect(isObjektArt(undefined)).toBe(false);
  });

  it('prüft eine Objektreferenz samt ID', () => {
    expect(isObjektRef({ art: 'gefahrobjekt', id: 'nd_hofer' })).toBe(true);
    expect(isObjektRef({ art: 'gefahrobjekt', id: '../call' })).toBe(false);
    expect(isObjektRef({ art: 'user', id: 'abc' })).toBe(false);
    expect(isObjektRef({ id: 'abc' })).toBe(false);
    expect(isObjektRef('abc')).toBe(false);
  });

  it('markiert Objekte mit ihrer Art', () => {
    expect(tagObjekte('gefahrobjekt', [{ id: 'g1', name: 'Markt', lat: 1, lng: 2 }])).toEqual([
      { id: 'g1', name: 'Markt', lat: 1, lng: 2, art: 'gefahrobjekt' },
    ]);
  });
});
