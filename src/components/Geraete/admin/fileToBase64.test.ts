// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { fileToBase64 } from './fileToBase64';

describe('fileToBase64', () => {
  it('liefert den Inhalt als Base64 ohne data:-Präfix', async () => {
    const file = new File(['ID;Bezeichnung'], 'export.csv', { type: 'text/csv' });
    const base64 = await fileToBase64(file);
    expect(base64).toBe(btoa('ID;Bezeichnung'));
  });
});
