import { describe, expect, it } from 'vitest';
import {
  STORAGE_NAME_PREFIX_LENGTH,
  displayFileName,
  storageFileName,
} from './attachmentName';

describe('attachmentName', () => {
  describe('storageFileName', () => {
    it('prefixes the name with a uuid and a dash', () => {
      const name = storageFileName('Lageskizze.png');

      expect(name).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}-Lageskizze\.png$/
      );
    });

    it('produces a distinct name for every call', () => {
      const first = storageFileName('IMG_0001.jpg');
      const second = storageFileName('IMG_0001.jpg');

      expect(first).not.toBe(second);
    });

    it('uses exactly STORAGE_NAME_PREFIX_LENGTH characters for the prefix', () => {
      const name = storageFileName('x.pdf');

      expect(name.length - 'x.pdf'.length).toBe(STORAGE_NAME_PREFIX_LENGTH);
    });
  });

  describe('displayFileName', () => {
    it('strips the uuid prefix again', () => {
      expect(displayFileName(storageFileName('Einsatzplan.pdf'))).toBe(
        'Einsatzplan.pdf'
      );
    });

    it('leaves a name without a uuid prefix untouched', () => {
      // Attachments imported before the prefix was restored on import carry
      // their bare name — chopping 37 characters off those emptied the name.
      expect(displayFileName('Einsatzplan.pdf')).toBe('Einsatzplan.pdf');
    });

    it('keeps a name that merely looks long but has no uuid prefix', () => {
      const long = 'Protokoll-Abschnitt-Nord-2026-08-27-Fassung-final.pdf';

      expect(displayFileName(long)).toBe(long);
    });

    it('handles an empty name', () => {
      expect(displayFileName('')).toBe('');
    });
  });
});
