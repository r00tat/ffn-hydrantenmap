import { describe, expect, it } from 'vitest';
import { normalizeFirestoreDb } from './config';

describe('normalizeFirestoreDb', () => {
  it('treats an empty / missing value as the default database', () => {
    expect(normalizeFirestoreDb('')).toBe('');
    expect(normalizeFirestoreDb(undefined)).toBe('');
  });

  it("treats the prod sentinel 'default' as the default database", () => {
    // The prod GitHub environment sets NEXT_PUBLIC_FIRESTORE_DB=default as a
    // sentinel. The Firebase SDK addresses the default database via
    // getFirestore(app) WITHOUT a database id — passing the literal string
    // 'default' raises "Database 'default' not found".
    expect(normalizeFirestoreDb('default')).toBe('');
  });

  it("treats the canonical '(default)' id as the default database", () => {
    expect(normalizeFirestoreDb('(default)')).toBe('');
  });

  it('trims surrounding whitespace', () => {
    expect(normalizeFirestoreDb('  default  ')).toBe('');
    expect(normalizeFirestoreDb('  ffndev  ')).toBe('ffndev');
  });

  it('keeps a real named database id untouched', () => {
    expect(normalizeFirestoreDb('ffndev')).toBe('ffndev');
  });
});
