import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildDocumentTitle } from './documentTitle';

describe('buildDocumentTitle', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('stellt den Seitennamen vor den App-Namen', () => {
    vi.stubEnv('NEXT_PUBLIC_FIRESTORE_DB', '');
    expect(buildDocumentTitle('Einsatzmittel')).toBe(
      'Einsatzmittel - Einsatzkarte FFN',
    );
  });

  it('bleibt ohne Seitennamen beim App-Namen', () => {
    vi.stubEnv('NEXT_PUBLIC_FIRESTORE_DB', '');
    expect(buildDocumentTitle()).toBe('Einsatzkarte FFN');
    expect(buildDocumentTitle('  ')).toBe('Einsatzkarte FFN');
  });

  it('kennzeichnet die Dev-Umgebung vorne', () => {
    vi.stubEnv('NEXT_PUBLIC_FIRESTORE_DB', 'ffndev');
    expect(buildDocumentTitle('Einsatzorte')).toBe(
      '🚧 DEV Einsatzorte - Einsatzkarte FFN',
    );
  });
});
