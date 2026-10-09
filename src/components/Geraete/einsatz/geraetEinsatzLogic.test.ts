import { describe, expect, it } from 'vitest';
import type { Geraet, GeraetBestand, GeraetEinsatz } from '../../../common/geraet';
import {
  buildGeraetEinsatzData,
  bestandForEdit,
  buildGeraetEinsatzUpdate,
  einsatzArtFor,
  findGeraetByCode,
  geraetForEntry,
  geraetOptionDetails,
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

  it('findet auch über Klasse, Vorlage, Hersteller-Typ und Bemerkung', () => {
    const messgeraete = [
      geraet({
        id: 'm1',
        bezeichnung: 'Mehrgasmessgerät 1',
        klasse1: 'Messgeräte und Nachweismittel',
        vorlage: 'Gasmessgerät',
        herstellerTyp: 'X-am 5000',
      }),
      geraet({
        id: 'pg',
        bezeichnung: 'Dräger - Prüfgas X-am',
        klasse1: 'Messgeräte und Nachweismittel',
        vorlage: 'Gasmessgerät',
      }),
      geraet({ id: 'wbk', bezeichnung: 'Wärmebildkamera - RLFA', klasse1: 'Messgeräte und Nachweismittel' }),
      geraet({ id: 'tox', bezeichnung: 'Toxmessgeräteset', bemerkung: 'H2S-Sensor' }),
    ];
    // Treffer in der Bezeichnung stehen vorn, danach die übrigen.
    expect(searchGeraete(messgeraete, 'messgerät').map((g) => g.id)).toEqual([
      'm1',
      'tox',
      'pg',
      'wbk',
    ]);
    expect(searchGeraete(messgeraete, 'gasmess').map((g) => g.id)).toEqual(['m1', 'pg']);
    expect(searchGeraete(messgeraete, 'x-am 5000').map((g) => g.id)).toEqual(['m1']);
    expect(searchGeraete(messgeraete, 'h2s').map((g) => g.id)).toEqual(['tox']);
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
      chargen: deleted,
      chargenGeprueft: deleted,
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
      chargen: deleted,
      chargenGeprueft: deleted,
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
      chargen: 'DELETE',
      chargenGeprueft: 'DELETE',
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

describe('geraetOptionDetails', () => {
  it('nennt Hersteller, Typ, Seriennummer und Lagerort', () => {
    const g = geraet({
      bezeichnung: 'Mehrgasmessgerät 2',
      hersteller: 'Dräger',
      herstellerTyp: 'X-am 2800',
      seriennummer: 'ARRJ0726',
      vorlage: 'Gasmessgerät',
    });
    expect(
      geraetOptionDetails(g, [
        bestand({ lagerort: { art: 'fahrzeug', fahrzeug: 'KRF-S', laderaum: 'G1' } }),
      ]),
    ).toBe('Gasmessgerät · Dräger X-am 2800 · SN ARRJ0726 · KRF-S · G1');
  });

  it('nimmt die Klasse, wenn es keine Vorlage gibt, und lässt Leeres weg', () => {
    expect(geraetOptionDetails(geraet({ klasse1: 'Messgeräte und Nachweismittel' }), [])).toBe(
      'Messgeräte und Nachweismittel',
    );
    expect(geraetOptionDetails(geraet({}), [])).toBe('');
  });

  it('kürzt viele Lagerorte ab', () => {
    const many = ['A', 'B', 'C', 'D'].map((name, i) =>
      bestand({ id: `b${i}`, lagerort: { art: 'raum', standort: name } }),
    );
    expect(geraetOptionDetails(geraet({}), many)).toBe('A, B +2');
  });
});

describe('Container am Einsatz', () => {
  const imContainer = { art: 'container' as const, container: 'Ölsperren 1', containerId: 'c1' };

  it('zählt einen Lagerort im zugeordneten Container als am Einsatz', () => {
    expect(matchesFirecallVehicle(imContainer, [], ['c1'])).toBe(true);
    expect(matchesFirecallVehicle(imContainer, ['Ölsperren 1'], [])).toBe(false);
    expect(matchesFirecallVehicle(imContainer, [], ['c2'])).toBe(false);
  });

  it('belegt den Lagerort im zugeordneten Container vor', () => {
    const lager = bestand({ id: 'lager', anzahl: 50 });
    const container = bestand({ id: 'container', anzahl: 2, lagerort: imContainer });
    expect(pickDefaultBestand([lager, container], [], ['c1'])?.id).toBe('container');
    expect(pickDefaultBestand([lager, container], [])?.id).toBe('lager');
  });
});

describe('Chargen beim Verbrauch', () => {
  const deleted = Symbol('deleted');
  const charge = (id: string, ablaufDatum?: string, archiviert?: boolean) => ({
    id,
    produktionsNummer: id.toUpperCase(),
    ablaufDatum,
    archiviert,
    createdAt: '',
    createdBy: '',
  });
  const mitChargen = geraet({
    verbrauchsmaterial: true,
    chargen: [charge('c1', '2026-12-01'), charge('c2', '2027-06-01')],
  });
  const base = { groupId: 'ffnd', nowIso: '2026-10-08T10:00:00.000Z', createdBy: 'u' };

  it('teilt ohne Angabe nach FEFO auf und verlangt eine Prüfung, wenn mehrere Töpfe Bestand haben', () => {
    const b = bestand({ anzahl: 10, chargen: { c1: 2, c2: 5 } });
    const data = buildGeraetEinsatzData({
      ...base,
      geraet: mitChargen,
      bestandId: 'b1',
      bestand: b,
      menge: 4,
    });
    expect(data.chargen).toEqual([
      { chargeId: 'c1', menge: 2 },
      { chargeId: 'c2', menge: 2 },
    ]);
    expect(data.chargenGeprueft).toBe(false);
  });

  it('ein einziger Topf mit Bestand gilt als geprüft', () => {
    const b = bestand({ anzahl: 5, chargen: { c2: 5 } });
    const data = buildGeraetEinsatzData({
      ...base,
      geraet: mitChargen,
      bestandId: 'b1',
      bestand: b,
      menge: 3,
    });
    expect(data.chargen).toEqual([{ chargeId: 'c2', menge: 3 }]);
    expect(data.chargenGeprueft).toBe(true);
  });

  it('übernimmt eine angegebene Aufteilung als geprüft', () => {
    const b = bestand({ anzahl: 10, chargen: { c1: 2, c2: 5 } });
    const chargen = [
      { chargeId: 'c2', menge: 3 },
      { chargeId: null, menge: 1 },
    ];
    const data = buildGeraetEinsatzData({
      ...base,
      geraet: mitChargen,
      bestandId: 'b1',
      bestand: b,
      menge: 4,
      chargen,
    });
    expect(data.chargen).toEqual(chargen);
    expect(data.chargenGeprueft).toBe(true);
  });

  it('ein Bestand mit Aufteilung zählt auch, wenn alle Chargen archiviert sind', () => {
    const archiviert = geraet({ verbrauchsmaterial: true, chargen: [charge('c1', undefined, true)] });
    const data = buildGeraetEinsatzData({
      ...base,
      geraet: archiviert,
      bestandId: 'b1',
      bestand: bestand({ anzahl: 3, chargen: { c1: 3 } }),
      menge: 1,
    });
    expect(data.chargen).toEqual([{ chargeId: 'c1', menge: 1 }]);
    expect(data.chargenGeprueft).toBe(true);
  });

  it('ohne Chargen am Artikel, ohne Bestand oder bei einer Zuordnung keine Felder', () => {
    const ohne = buildGeraetEinsatzData({
      ...base,
      geraet: geraet({ verbrauchsmaterial: true }),
      bestandId: 'b1',
      bestand: bestand({ anzahl: 3 }),
      menge: 1,
    });
    expect('chargen' in ohne).toBe(false);
    expect('chargenGeprueft' in ohne).toBe(false);

    const ohneBestand = buildGeraetEinsatzData({
      ...base,
      geraet: mitChargen,
      menge: 1,
    });
    expect('chargen' in ohneBestand).toBe(false);

    const zuordnung = buildGeraetEinsatzData({
      ...base,
      geraet: { ...mitChargen, verbrauchsmaterial: false },
      bestand: bestand({ anzahl: 3, chargen: { c1: 3 } }),
      menge: 1,
    });
    expect('chargen' in zuordnung).toBe(false);
  });

  it('Änderung: setzt die Aufteilung neu', () => {
    const patch = buildGeraetEinsatzUpdate(
      {
        geraet: mitChargen,
        bestandId: 'b1',
        bestand: bestand({ anzahl: 10, chargen: { c1: 2, c2: 5 } }),
        menge: 3,
      },
      () => deleted,
    );
    expect(patch.chargen).toEqual([
      { chargeId: 'c1', menge: 2 },
      { chargeId: 'c2', menge: 1 },
    ]);
    expect(patch.chargenGeprueft).toBe(false);
  });

  it('Änderung: eine angegebene Aufteilung gilt als geprüft', () => {
    const patch = buildGeraetEinsatzUpdate(
      {
        geraet: mitChargen,
        bestandId: 'b1',
        bestand: bestand({ anzahl: 10, chargen: { c1: 2, c2: 5 } }),
        menge: 3,
        chargen: [{ chargeId: 'c2', menge: 3 }],
      },
      () => deleted,
    );
    expect(patch.chargen).toEqual([{ chargeId: 'c2', menge: 3 }]);
    expect(patch.chargenGeprueft).toBe(true);
  });

  it('Änderung mit unbekanntem, aber unverändertem Lagerort lässt die Aufteilung stehen', () => {
    const patch = buildGeraetEinsatzUpdate(
      { geraet: mitChargen, bestandId: 'b1', entryBestandId: 'b1', menge: 3, bemerkung: 'x' },
      () => deleted,
    );
    expect('chargen' in patch).toBe(false);
    expect('chargenGeprueft' in patch).toBe(false);
    expect(patch.bemerkung).toBe('x');
  });

  it('Änderung auf einen anderen, unbekannten Lagerort löscht die Aufteilung', () => {
    const patch = buildGeraetEinsatzUpdate(
      { geraet: mitChargen, bestandId: 'b2', entryBestandId: 'b1', menge: 3 },
      () => deleted,
    );
    expect(patch.chargen).toBe(deleted);
    expect(patch.chargenGeprueft).toBe(deleted);
  });

  it('Änderung ohne Chargen löscht beide Felder', () => {
    const patch = buildGeraetEinsatzUpdate(
      { geraet: geraet({ verbrauchsmaterial: true }), bestandId: 'b1', menge: 3 },
      () => deleted,
    );
    expect(patch.chargen).toBe(deleted);
    expect(patch.chargenGeprueft).toBe(deleted);
  });
});

describe('bestandForEdit', () => {
  const entry = (overrides: Partial<GeraetEinsatz> = {}): GeraetEinsatz => ({
    id: 'e1',
    groupId: 'ffnd',
    geraetId: 'g1',
    geraetName: 'Bindevlies',
    art: 'verbraucht',
    bestandId: 'b1',
    menge: 3,
    gebucht: true,
    zeitpunkt: '',
    createdAt: '',
    createdBy: '',
    ...overrides,
  });

  it('rechnet den schon gebuchten Verbrauch des Eintrags wieder dazu', () => {
    const b = bestand({ anzahl: 4, chargen: { c1: 1 } });
    expect(
      bestandForEdit(
        b,
        entry({
          chargen: [
            { chargeId: 'c1', menge: 2 },
            { chargeId: null, menge: 1 },
          ],
        }),
      ),
    ).toMatchObject({ anzahl: 7, chargen: { c1: 3 } });
  });

  it('ein Verbrauch ohne Aufteilung wurde vom Rest gebucht', () => {
    const b = bestand({ anzahl: 4, chargen: { c1: 1 } });
    expect(bestandForEdit(b, entry())).toMatchObject({ anzahl: 7, chargen: { c1: 1 } });
  });

  it('nicht gebucht, anderer Lagerort oder neuer Eintrag: unverändert', () => {
    const b = bestand({ anzahl: 4 });
    expect(bestandForEdit(b, entry({ gebucht: false }))).toBe(b);
    expect(bestandForEdit(b, entry({ bestandId: 'b2' }))).toBe(b);
    expect(bestandForEdit(b, undefined)).toBe(b);
    expect(bestandForEdit(undefined, entry())).toBeUndefined();
  });
});
