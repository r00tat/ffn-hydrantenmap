import { describe, expect, it } from 'vitest';
import type { FuellungInput } from '../../common/atemschutz';
import { buildFuellungDocument } from './fuellungErfassung';

const basis: FuellungInput = {
  flaschenNummer: '2.16.19',
  feuerwehr: 'FF Weiden',
  anzahl: 1,
  enddruck: 300,
  gefuelltVon: 'Paul',
  verrechnen: true,
};

describe('buildFuellungDocument', () => {
  it('setzt firecallId auch ohne Einsatz, und zwar leer', () => {
    const doc = buildFuellungDocument(basis, { firecallId: '', now: 'T' });
    expect(doc.firecallId).toBe('');
    expect('firecallName' in doc).toBe(false);
  });

  it('setzt verrechnen auch dann, wenn es false ist', () => {
    const doc = buildFuellungDocument(
      { ...basis, verrechnen: false },
      { firecallId: '', now: 'T' },
    );
    expect(doc.verrechnen).toBe(false);
  });

  it('übernimmt Einsatz und Station samt Namenskopie', () => {
    const doc = buildFuellungDocument(
      { ...basis, fuellstationId: 'k1', fuellstationName: 'Mobiler Kompressor' },
      { firecallId: 'abc', firecallName: 'Brand K1', now: 'T' },
    );
    expect(doc.firecallId).toBe('abc');
    expect(doc.firecallName).toBe('Brand K1');
    expect(doc.fuellstationId).toBe('k1');
    expect(doc.fuellstationName).toBe('Mobiler Kompressor');
  });

  it('lässt leere Werte weg statt undefined zu schreiben', () => {
    const doc = buildFuellungDocument(
      { ...basis, feuerwehr: '  ', bemerkung: '' },
      { firecallId: '', now: 'T' },
    );
    expect('feuerwehr' in doc).toBe(false);
    expect('bemerkung' in doc).toBe(false);
  });

  it('nimmt den übergebenen Zeitpunkt, sonst die aktuelle Zeit', () => {
    expect(
      buildFuellungDocument(
        { ...basis, zeitpunkt: 'X' },
        { firecallId: '', now: 'T' },
      ).zeitpunkt,
    ).toBe('X');
    expect(
      buildFuellungDocument(basis, { firecallId: '', now: 'T' }).zeitpunkt,
    ).toBe('T');
  });
});
