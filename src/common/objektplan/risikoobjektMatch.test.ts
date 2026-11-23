import { describe, expect, it } from 'vitest';
import type { RisikoObjekt } from '../gis-objects';
import {
  matchRisikoObjekte,
  normalizeStreet,
  parseAddress,
  sameHouseNumber,
  similarity,
} from './risikoobjektMatch';

function objekt(partial: Partial<RisikoObjekt> & { id: string }): RisikoObjekt {
  return {
    name: partial.id,
    adresse: '',
    einsatzplanummer: '',
    erfassungsdatum: '',
    ortschaft: 'ND',
    risikogruppe: '',
    lat: 0,
    lng: 0,
    ...partial,
  };
}

const altenwohnheim = objekt({
  id: 'altenwohnheim',
  name: 'Altenwohnheim',
  adresse: 'Kardinal Franz Königplatz 1',
  lat: 47.94412,
  lng: 16.84102,
});
const metro = objekt({
  id: 'metro',
  name: 'Metro (ehemals AGM)',
  adresse: 'Wienerstraße 110',
  lat: 47.96743,
  lng: 16.83887,
});
const ams = objekt({
  id: 'ams',
  name: 'AMS',
  adresse: 'Wienerstraße 15',
  lat: 47.95323,
  lng: 16.83667,
});
const heim = objekt({
  id: 'heim',
  name: 'Wohnheim',
  adresse: 'Franz Liszgasse 8',
  lat: 47.94651,
  lng: 16.84804,
});
const eisner = objekt({
  id: 'eisner',
  name: 'Autohaus Eisner',
  adresse: 'Erwin Schrädingerstr 1',
  lat: 47.97353,
  lng: 16.8429,
});
const kamper = objekt({
  id: 'kamper',
  name: 'Autohaus KAMPER',
  adresse: 'Gewerbegebiet Predium',
  lat: 47.97157,
  lng: 16.85456,
});
const dehner = objekt({
  id: 'dehner',
  name: 'Gartencenter Dehner',
  adresse: 'Ludwig Boltzmannstraße 16, 7100 Neusiedl am See',
  lat: 47.97058,
  lng: 16.85079,
});
const ohneLage = objekt({ id: 'ohneLage', name: 'Ohne Lage', adresse: 'Seestraße 3' });

const ALL = [altenwohnheim, metro, ams, heim, eisner, kamper, dehner, ohneLage];

function ids(result: { objekt: RisikoObjekt }[]): string[] {
  return result.map((m) => m.objekt.id as string);
}

describe('normalizeStreet', () => {
  it('gleicht Straße, Str., Umlaute und Bindestriche an', () => {
    expect(normalizeStreet('Wiener Straße')).toBe(normalizeStreet('Wienerstraße'));
    expect(normalizeStreet('Wiener Str.')).toBe(normalizeStreet('Wienerstrasse'));
    expect(normalizeStreet('Kardinal-König-Platz')).toBe(normalizeStreet('Kardinal König Pl.'));
    expect(normalizeStreet('Erwin Schrädingerstr')).toBe('erwinschraedingerstrasse');
  });
});

describe('parseAddress', () => {
  it('trennt Straße und Hausnummer und wirft PLZ und Ort weg', () => {
    expect(parseAddress('Ludwig Boltzmannstraße 16, 7100 Neusiedl am See')).toEqual({
      street: 'ludwigboltzmannstrasse',
      number: '16',
    });
    expect(parseAddress('Teichgasse 1a')).toEqual({ street: 'teichgasse', number: '1a' });
    expect(parseAddress('Gewerbegebiet Predium')).toEqual({
      street: 'gewerbegebietpredium',
      number: undefined,
    });
  });
});

describe('similarity', () => {
  it('ist 1 bei Gleichheit und hoch bei Tippfehlern', () => {
    expect(similarity('wienerstrasse', 'wienerstrasse')).toBe(1);
    expect(similarity('franzliszgasse', 'franzlisztgasse')).toBeGreaterThan(0.75);
    expect(similarity('wienerstrasse', 'seestrasse')).toBeLessThan(0.6);
  });
});

describe('matchRisikoObjekte', () => {
  it('findet ein Objekt über die Lage, auch wenn sie etwas daneben liegt', () => {
    const result = matchRisikoObjekte(ALL, {
      positions: [{ lat: 47.94440, lng: 16.84130 }],
      texts: [],
    });
    expect(ids(result)[0]).toBe('altenwohnheim');
    expect(result[0].distanceM).toBeLessThan(50);
  });

  it('nennt nichts, was weit weg ist und auch sonst nicht passt', () => {
    const result = matchRisikoObjekte(ALL, {
      positions: [{ lat: 47.85386, lng: 16.839702 }],
      texts: ['Neusiedl am See/SA6/B2/Kellerbrand/Podersdorf/Friedhofgasse/2/'],
    });
    expect(result).toEqual([]);
  });

  it('findet ein Objekt über die Adresse im Alarmtext trotz anderer Schreibweise', () => {
    const result = matchRisikoObjekte(ALL, {
      positions: [],
      texts: ['Neusiedl am See/SA1/B3/Brandmeldealarm/Neusiedl am See/Wiener Straße/110/'],
    });
    expect(ids(result)[0]).toBe('metro');
    expect(result[0].address).toBe('exact');
    // Die andere Hausnummer derselben Straße kommt nur nachrangig.
    const amsMatch = result.find((m) => m.objekt.id === 'ams');
    if (amsMatch) expect(amsMatch.score).toBeLessThan(result[0].score);
  });

  it('erkennt Tippfehler im Straßennamen und Abkürzungen', () => {
    const result = matchRisikoObjekte(ALL, {
      positions: [],
      texts: ['B2 Zimmerbrand Franz-Liszt-Gasse 8'],
    });
    expect(ids(result)[0]).toBe('heim');
    expect(result[0].address).toBe('exact');

    const str = matchRisikoObjekte(ALL, {
      positions: [],
      texts: ['T1 Fahrzeugbergung Erwin-Schrödinger-Straße 1'],
    });
    expect(ids(str)[0]).toBe('eisner');
  });

  it('nimmt Straße und Hausnummer aus einem Einsatzort', () => {
    const result = matchRisikoObjekte(ALL, {
      positions: [],
      texts: [],
      addresses: [{ street: 'Kardinal-König-Platz', number: '1' }],
    });
    expect(ids(result)[0]).toBe('altenwohnheim');
  });

  it('findet ein Objekt über seinen Namen, seltene Wörter zählen mehr', () => {
    const result = matchRisikoObjekte(ALL, {
      positions: [],
      texts: ['B2 Brand Autohaus Kamper'],
    });
    expect(ids(result)[0]).toBe('kamper');
    expect(result[0].name).toBe(true);
    // „Autohaus" allein passt auch auf Eisner, aber schwächer.
    const eisnerMatch = result.find((m) => m.objekt.id === 'eisner');
    expect(eisnerMatch?.score ?? 0).toBeLessThan(result[0].score);
  });

  it('erkennt einen Namen auch mit Tippfehler', () => {
    const result = matchRisikoObjekte(ALL, {
      positions: [],
      texts: ['BMA Altenwohnhiem'],
    });
    expect(ids(result)[0]).toBe('altenwohnheim');
  });

  it('verbindet Lage und Adresse und sortiert nach Punkten', () => {
    const result = matchRisikoObjekte(ALL, {
      positions: [{ lat: 47.9673, lng: 16.8389 }],
      texts: ['Wienerstraße 110'],
    });
    expect(ids(result)[0]).toBe('metro');
    expect(result[0].score).toBeGreaterThan(0.9);
  });

  it('begrenzt die Zahl der Treffer', () => {
    const result = matchRisikoObjekte(
      ALL,
      { positions: [], texts: ['Wienerstraße'] },
      { limit: 1, minScore: 0.1 },
    );
    expect(result).toHaveLength(1);
  });

  it('übersieht Objekte ohne Lage nicht bei passender Adresse', () => {
    const result = matchRisikoObjekte(ALL, {
      positions: [{ lat: 47.9, lng: 16.8 }],
      texts: ['Seestraße 3'],
    });
    expect(ids(result)).toContain('ohneLage');
    expect(result.find((m) => m.objekt.id === 'ohneLage')?.distanceM).toBeUndefined();
  });

  it('wertet Ortsnamen im Alarmtext nicht als Straße', () => {
    const result = matchRisikoObjekte([ohneLage], {
      positions: [],
      texts: ['Neusiedl am See/SA1/B1/Mistkübelbrand'],
    });
    expect(result).toEqual([]);
  });

  it('zählt Ortsnamen nicht als Namenstreffer', () => {
    const bh = objekt({ id: 'bh', name: 'BH Neusiedl am See', adresse: 'Eisenstädterstraße 1a' });
    const alarm = 'Neusiedl am See/SA1/B1/Mistkübelbrand/Neusiedl am See/Pionierweg/1/';
    expect(
      matchRisikoObjekte([bh, ...ALL], {
        positions: [],
        texts: [alarm],
        placeNames: ['Neusiedl am See'],
      }),
    ).toEqual([]);
    const result = matchRisikoObjekte([bh, ...ALL], {
      positions: [],
      texts: ['BMA BH Neusiedl am See'],
      placeNames: ['Neusiedl am See'],
    });
    expect(ids(result)[0]).toBe('bh');
  });

  it('wertet die Straße allein schwächer, je mehr Objekte dort liegen', () => {
    const many = Array.from({ length: 9 }, (_, i) =>
      objekt({ id: `w${i}`, name: `Betrieb ${i}`, adresse: `Wienerstraße ${i + 1}` }),
    );
    expect(
      matchRisikoObjekte(many, { positions: [], texts: ['Wiener Straße/Vis a Vis Umspannwerk'] }),
    ).toEqual([]);
    const exact = matchRisikoObjekte(many, { positions: [], texts: ['Wiener Straße/4/'] });
    expect(ids(exact)).toEqual(['w3']);
  });

  it('erkennt eine Hausnummer im Bereich des Objekts', () => {
    const pionierweg = objekt({ id: 'pw', name: 'Wohnanlage', adresse: 'Pionierweg 1-3' });
    const result = matchRisikoObjekte([pionierweg], {
      positions: [],
      texts: ['Neusiedl am See/SA1/B2/Müllraumbrand/Neusiedl am See/Pionierweg/2/+Polizei'],
    });
    expect(result[0]?.address).toBe('exact');
  });
});

describe('sameHouseNumber', () => {
  it('vergleicht Zahl, Zusatz und Bereich', () => {
    expect(sameHouseNumber('1a', '1')).toBe(true);
    expect(sameHouseNumber('70/1', '70')).toBe(true);
    expect(sameHouseNumber('6-8', '7')).toBe(true);
    expect(sameHouseNumber('6-8', '9')).toBe(false);
    expect(sameHouseNumber('110', '11')).toBe(false);
  });
});
