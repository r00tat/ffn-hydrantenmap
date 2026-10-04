import { describe, expect, it } from 'vitest';
import type { Geraet, GeraetBestand, GeraetEinsatz } from '../../../common/geraet';
import {
  buildGeraetEinsatzData,
  buildGeraetEinsatzUpdate,
  einsatzArtFor,
  findGeraetByCode,
  geraetForEntry,
  geraetOptionLabel,
  isPendingBooking,
  matchesFirecallVehicle,
  pickDefaultBestand,
  searchGeraete,
  usesHours,
  validateGeraetEinsatzInput,
} from './geraetEinsatzLogic';

function geraet(overrides: Partial<Geraet> = {}): Geraet {
  return {
    id: 'g1',
    bezeichnung: 'Bindevlies Economy',
    verbrauchsmaterial: false,
    bestandGesamt: 0,
    active: true,
    createdAt: '',
    createdBy: '',
    updatedAt: '',
    updatedBy: '',
    ...overrides,
  };
}

function bestand(overrides: Partial<GeraetBestand> = {}): GeraetBestand {
  return {
    id: 'b1',
    geraetId: 'g1',
    lagerortKey: 'raum|feuerwehrhaus|lager',
    lagerort: { art: 'raum', standort: 'Feuerwehrhaus', raum: 'Lager' },
    anzahl: 1,
    ...overrides,
  };
}

describe('searchGeraete', () => {
  const list = [
    geraet({ id: 'a', bezeichnung: 'Bindevlies Economy', inventarNr: '4711' }),
    geraet({ id: 'b', bezeichnung: 'Schutzanzug Tychem', barcodes: ['ABC123'] }),
    geraet({ id: 'c', bezeichnung: 'Filter A2B2', zusatzInventarNr: 'Z-9' }),
    geraet({ id: 'd', bezeichnung: 'Bindemittel alt', active: false }),
  ];

  it('findet über Bezeichnung, Inventar-Nr. und Barcode, Groß-/Kleinschreibung egal', () => {
    expect(searchGeraete(list, 'binde').map((g) => g.id)).toEqual(['a']);
    expect(searchGeraete(list, '4711').map((g) => g.id)).toEqual(['a']);
    expect(searchGeraete(list, 'abc1').map((g) => g.id)).toEqual(['b']);
    expect(searchGeraete(list, 'z-9').map((g) => g.id)).toEqual(['c']);
  });

  it('verlangt alle Suchwörter', () => {
    expect(searchGeraete(list, 'schutz tychem').map((g) => g.id)).toEqual(['b']);
    expect(searchGeraete(list, 'schutz filter')).toEqual([]);
  });

  it('lässt inaktive Artikel weg und liefert ohne Suchtext alle aktiven', () => {
    expect(searchGeraete(list, '').map((g) => g.id)).toEqual(['a', 'b', 'c']);
  });

  it('begrenzt die Trefferzahl', () => {
    expect(searchGeraete(list, '', 2)).toHaveLength(2);
  });
});

describe('findGeraetByCode', () => {
  const list = [
    geraet({ id: 'a', inventarNr: '4711' }),
    geraet({ id: 'b', barcodes: ['ABC123', 'X1'] }),
    geraet({ id: 'c', seriennummer: 'SN-1', externeId: '99' }),
    geraet({ id: 'd', barcodes: ['abc123'], active: false }),
  ];

  it('trifft nur exakt, ohne Rücksicht auf Groß-/Kleinschreibung und Leerzeichen', () => {
    expect(findGeraetByCode(list, ' abc123 ').map((g) => g.id)).toEqual(['b']);
    expect(findGeraetByCode(list, '4711').map((g) => g.id)).toEqual(['a']);
    expect(findGeraetByCode(list, 'sn-1').map((g) => g.id)).toEqual(['c']);
    expect(findGeraetByCode(list, '99').map((g) => g.id)).toEqual(['c']);
    expect(findGeraetByCode(list, 'abc')).toEqual([]);
    expect(findGeraetByCode(list, '')).toEqual([]);
  });
});

describe('einsatzArtFor / usesHours', () => {
  it('Verbrauchsmaterial wird verbraucht, alles andere zugeordnet', () => {
    expect(einsatzArtFor(geraet({ verbrauchsmaterial: true }))).toBe('verbraucht');
    expect(einsatzArtFor(geraet({ verbrauchsmaterial: false }))).toBe('zugeordnet');
  });

  it('Stunden nur bei Einheit h und nicht bei Verbrauchsmaterial', () => {
    expect(usesHours(geraet({ einheitVerwendungsnachweis: 'h' }))).toBe(true);
    expect(usesHours(geraet({ einheitVerwendungsnachweis: 'stk' }))).toBe(false);
    expect(
      usesHours(geraet({ einheitVerwendungsnachweis: 'h', verbrauchsmaterial: true })),
    ).toBe(false);
  });
});

describe('matchesFirecallVehicle', () => {
  it('erkennt das Fahrzeug als Wort im Namen des Einsatzmittels', () => {
    const srf = { art: 'fahrzeug' as const, fahrzeug: 'SRF', laderaum: 'GR 2' };
    expect(matchesFirecallVehicle(srf, ['SRF Neusiedl'])).toBe(true);
    expect(matchesFirecallVehicle(srf, ['srf'])).toBe(true);
    expect(matchesFirecallVehicle(srf, ['SRFX'])).toBe(false);
    expect(matchesFirecallVehicle(srf, ['TLFA 4000'])).toBe(false);
  });

  it('erkennt auch den längeren Namen am Lagerort', () => {
    expect(
      matchesFirecallVehicle({ art: 'fahrzeug', fahrzeug: 'KLF-A Neusiedl' }, ['KLF-A']),
    ).toBe(true);
  });

  it('Räume und leere Fahrzeugnamen zählen nie', () => {
    expect(matchesFirecallVehicle({ art: 'raum', standort: 'SRF' }, ['SRF'])).toBe(false);
    expect(matchesFirecallVehicle({ art: 'fahrzeug', fahrzeug: ' ' }, ['SRF'])).toBe(false);
  });
});

describe('pickDefaultBestand', () => {
  const lager = bestand({ id: 'lager', anzahl: 50 });
  const srf = bestand({
    id: 'srf',
    anzahl: 3,
    lagerortKey: 'fahrzeug|srf|gr 2',
    lagerort: { art: 'fahrzeug', fahrzeug: 'SRF', laderaum: 'GR 2' },
  });
  const tlf = bestand({
    id: 'tlf',
    anzahl: 5,
    lagerortKey: 'fahrzeug|tlfa|g1',
    lagerort: { art: 'fahrzeug', fahrzeug: 'TLFA', laderaum: 'G1' },
  });

  it('nimmt einen Lagerort auf einem Fahrzeug des Einsatzes', () => {
    expect(pickDefaultBestand([lager, srf, tlf], ['SRF'])?.id).toBe('srf');
  });

  it('unter mehreren Fahrzeugen des Einsatzes den größten Bestand', () => {
    expect(pickDefaultBestand([lager, srf, tlf], ['SRF', 'TLFA'])?.id).toBe('tlf');
  });

  it('ohne Fahrzeug des Einsatzes den größten Bestand', () => {
    expect(pickDefaultBestand([srf, lager, tlf], ['RLFA'])?.id).toBe('lager');
  });

  it('ohne Bestand nichts', () => {
    expect(pickDefaultBestand([], ['SRF'])).toBeUndefined();
  });
});

describe('validateGeraetEinsatzInput', () => {
  it('verlangt einen Artikel', () => {
    expect(validateGeraetEinsatzInput({ geraet: undefined })).toBe('noGeraet');
  });

  it('verlangt beim Verbrauch eine positive Menge', () => {
    const g = geraet({ verbrauchsmaterial: true });
    expect(validateGeraetEinsatzInput({ geraet: g, menge: 0, bestandId: 'b' })).toBe(
      'invalidMenge',
    );
    expect(validateGeraetEinsatzInput({ geraet: g, menge: 2, bestandId: 'b' })).toBeNull();
  });

  it('verlangt beim Verbrauch einen Lagerort, wenn es Bestände gibt', () => {
    const g = geraet({ verbrauchsmaterial: true });
    expect(validateGeraetEinsatzInput({ geraet: g, menge: 1 }, 2)).toBe('noBestand');
    expect(validateGeraetEinsatzInput({ geraet: g, menge: 1 }, 0)).toBeNull();
  });

  it('lehnt Mengen und Stunden über der Obergrenze ab', () => {
    const v = geraet({ verbrauchsmaterial: true });
    expect(validateGeraetEinsatzInput({ geraet: v, menge: 1e308, bestandId: 'b' })).toBe(
      'invalidMenge',
    );
    expect(validateGeraetEinsatzInput({ geraet: geraet(), menge: 1e9 })).toBe('invalidMenge');
    const h = geraet({ einheitVerwendungsnachweis: 'h' });
    expect(validateGeraetEinsatzInput({ geraet: h, stunden: 1e9 })).toBe('invalidStunden');
  });

  it('Stunden dürfen nicht negativ sein, die Menge einer Zuordnung ist frei', () => {
    const h = geraet({ einheitVerwendungsnachweis: 'h' });
    expect(validateGeraetEinsatzInput({ geraet: h, stunden: -1 })).toBe('invalidStunden');
    expect(validateGeraetEinsatzInput({ geraet: h, stunden: 1.5 })).toBeNull();
    expect(validateGeraetEinsatzInput({ geraet: geraet() })).toBeNull();
  });
});

describe('buildGeraetEinsatzData', () => {
  const now = '2026-10-04T10:00:00.000Z';

  it('Verbrauch: Lagerort und Menge, ohne undefined-Felder', () => {
    const data = buildGeraetEinsatzData({
      groupId: 'ffnd',
      geraet: geraet({ id: 'g7', bezeichnung: 'Filter A2B2', verbrauchsmaterial: true }),
      bestandId: 'b3',
      menge: 3,
      stunden: 2,
      bemerkung: '  am Kanal ',
      nowIso: now,
      createdBy: 'max.mustermann@example.com',
    });
    expect(data).toEqual({
      groupId: 'ffnd',
      geraetId: 'g7',
      geraetName: 'Filter A2B2',
      art: 'verbraucht',
      bestandId: 'b3',
      menge: 3,
      zeitpunkt: now,
      bemerkung: 'am Kanal',
      createdAt: now,
      createdBy: 'max.mustermann@example.com',
    });
    expect(Object.values(data)).not.toContain(undefined);
  });

  it('Zuordnung mit Stunden: kein Lagerort, keine Menge', () => {
    const data = buildGeraetEinsatzData({
      groupId: 'ffnd',
      geraet: geraet({ einheitVerwendungsnachweis: 'h' }),
      bestandId: 'b3',
      menge: 4,
      stunden: 1.5,
      bemerkung: '',
      nowIso: now,
      createdBy: 'x',
    });
    expect(data.art).toBe('zugeordnet');
    expect(data.stunden).toBe(1.5);
    expect('bestandId' in data).toBe(false);
    expect('menge' in data).toBe(false);
    expect('bemerkung' in data).toBe(false);
  });

  it('Zuordnung in Stück behält die Menge', () => {
    const data = buildGeraetEinsatzData({
      groupId: 'ffnd',
      geraet: geraet(),
      menge: 2,
      nowIso: now,
      createdBy: 'x',
    });
    expect(data.menge).toBe(2);
    expect('stunden' in data).toBe(false);
  });
});

describe('buildGeraetEinsatzUpdate', () => {
  const deleted = Symbol('deleted');

  it('setzt geänderte Felder, löscht geleerte und markiert den Verbrauch als nicht gebucht', () => {
    const patch = buildGeraetEinsatzUpdate(
      {
        geraet: geraet({ verbrauchsmaterial: true }),
        bestandId: 'b2',
        menge: 5,
        bemerkung: '',
      },
      () => deleted,
    );
    expect(patch).toEqual({
      bestandId: 'b2',
      menge: 5,
      stunden: deleted,
      bemerkung: deleted,
      gebucht: false,
    });
  });

  it('eine Zuordnung bekommt kein gebucht', () => {
    const patch = buildGeraetEinsatzUpdate(
      { geraet: geraet({ einheitVerwendungsnachweis: 'h' }), stunden: 3, bemerkung: 'x' },
      () => deleted,
    );
    expect(patch).toEqual({
      bestandId: deleted,
      menge: deleted,
      stunden: 3,
      bemerkung: 'x',
    });
  });
});

describe('isPendingBooking', () => {
  const base = { art: 'verbraucht' } as GeraetEinsatz;
  it('nur ein Verbrauch ohne gebucht === true', () => {
    expect(isPendingBooking(base)).toBe(true);
    expect(isPendingBooking({ ...base, gebucht: false })).toBe(true);
    expect(isPendingBooking({ ...base, gebucht: true })).toBe(false);
    expect(isPendingBooking({ ...base, art: 'zugeordnet' })).toBe(false);
  });
});

describe('geraetOptionLabel', () => {
  it('zeigt Bezeichnung und Inventar-Nr.', () => {
    expect(geraetOptionLabel(geraet({ bezeichnung: 'Filter', inventarNr: '12' }))).toBe(
      'Filter (12)',
    );
    expect(geraetOptionLabel(geraet({ bezeichnung: 'Filter' }))).toBe('Filter');
  });
});

describe('geraetForEntry', () => {
  const base = {
    id: 'e1',
    groupId: 'ffnd',
    geraetId: 'g1',
    geraetName: 'Bindevlies Economy',
    zeitpunkt: '',
    createdAt: '',
    createdBy: '',
  };

  it('ein Verbrauch bleibt ein Verbrauch, auch wenn der Artikel kein Verbrauchsmaterial mehr ist', () => {
    const entry: GeraetEinsatz = { ...base, art: 'verbraucht', bestandId: 'b1', menge: 5 };
    const effective = geraetForEntry(geraet({ verbrauchsmaterial: false }), entry);
    expect(effective.verbrauchsmaterial).toBe(true);
    // Nur die Bemerkung geändert: Der Lagerort bleibt, der Verbrauch gilt als ungebucht.
    expect(
      buildGeraetEinsatzUpdate(
        { geraet: effective, bestandId: 'b1', menge: 5, bemerkung: 'nachgetragen' },
        () => 'DELETE',
      ),
    ).toEqual({
      bestandId: 'b1',
      menge: 5,
      stunden: 'DELETE',
      bemerkung: 'nachgetragen',
      gebucht: false,
    });
  });

  it('eine Zuordnung bleibt eine Zuordnung, auch wenn der Artikel Verbrauchsmaterial wurde', () => {
    const entry: GeraetEinsatz = { ...base, art: 'zugeordnet', menge: 1 };
    const effective = geraetForEntry(geraet({ verbrauchsmaterial: true }), entry);
    expect(effective.verbrauchsmaterial).toBe(false);
    const patch = buildGeraetEinsatzUpdate(
      { geraet: effective, bestandId: 'b1', menge: 1 },
      () => 'DELETE',
    );
    expect(patch.bestandId).toBe('DELETE');
    expect('gebucht' in patch).toBe(false);
  });

  it('Stunden oder Stück folgen dem Eintrag, nicht der heutigen Einheit des Artikels', () => {
    const hours: GeraetEinsatz = { ...base, art: 'zugeordnet', stunden: 2 };
    expect(usesHours(geraetForEntry(geraet({ einheitVerwendungsnachweis: 'stk' }), hours))).toBe(
      true,
    );
    const pieces: GeraetEinsatz = { ...base, art: 'zugeordnet', menge: 2 };
    expect(usesHours(geraetForEntry(geraet({ einheitVerwendungsnachweis: 'h' }), pieces))).toBe(
      false,
    );
  });
});
