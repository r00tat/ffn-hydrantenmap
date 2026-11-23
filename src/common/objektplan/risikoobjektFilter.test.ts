import { describe, expect, it } from 'vitest';
import type { RisikoObjekt } from '../gis-objects';
import { filterRisikoObjekte } from './risikoobjektFilter';

function objekt(over: Partial<RisikoObjekt>): RisikoObjekt {
  return {
    id: 'x',
    name: '',
    lat: 47.9,
    lng: 16.8,
    adresse: '',
    einsatzplanummer: '',
    erfassungsdatum: '',
    ortschaft: 'ND',
    risikogruppe: '',
    ...over,
  };
}

const liste = [
  objekt({ id: 'spar', name: 'Spar Wr. Strasse', adresse: 'Wienerstrasse 65', einsatzplanummer: 64 as unknown as string, risikogruppe: 'Geschäftsbauten > 2000 m2' }),
  objekt({ id: 'schule', name: 'Volksschule', ortschaft: 'Weiden', adresse: 'Schulgasse 1', risikogruppe: 'Schulen u. Kinderbetreuung' }),
  objekt({ id: 'bp', name: 'Tankstelle BP', adresse: 'Wienerstraße 69', risikogruppe: 'Bauten besondere Brandgefahr' }),
];

describe('filterRisikoObjekte', () => {
  it('sortiert nach Ortschaft und Name', () => {
    expect(filterRisikoObjekte(liste, '').map((o) => o.id)).toEqual(['spar', 'bp', 'schule']);
  });

  it('findet über Name, Adresse, Ortschaft und Risikogruppe, ohne Groß-/Kleinschreibung', () => {
    expect(filterRisikoObjekte(liste, 'spar').map((o) => o.id)).toEqual(['spar']);
    expect(filterRisikoObjekte(liste, 'weiden').map((o) => o.id)).toEqual(['schule']);
    expect(filterRisikoObjekte(liste, 'SCHULEN').map((o) => o.id)).toEqual(['schule']);
  });

  it('verlangt alle Wörter', () => {
    expect(filterRisikoObjekte(liste, 'wiener 69').map((o) => o.id)).toEqual(['bp']);
  });

  it('findet die Einsatzplannummer, auch als Zahl gespeichert', () => {
    expect(filterRisikoObjekte(liste, '64').map((o) => o.id)).toEqual(['spar']);
  });

  it('gleicht ß und ss an', () => {
    expect(filterRisikoObjekte(liste, 'wienerstrasse').map((o) => o.id)).toEqual(['spar', 'bp']);
  });
});
