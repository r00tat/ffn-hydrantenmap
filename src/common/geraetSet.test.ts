import { describe, expect, it } from 'vitest';
import type { Geraet, GeraetBestand, GeraetEinsatz, GeraetSet } from './geraet';
import {
  expandSetForEinsatz,
  findByCode,
  groupEntriesBySet,
  normalizeSetCodes,
  searchSets,
  setCodesOf,
  validateGeraetSet,
  type GeraetSetInput,
} from './geraetSet';

function geraet(overrides: Partial<Geraet>): Geraet {
  return {
    id: 'g',
    bezeichnung: 'Artikel',
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

const besen = geraet({ id: 'besen', bezeichnung: 'Besen' });
const schaufel = geraet({
  id: 'schaufel',
  bezeichnung: 'Schaufel',
  einheitVerwendungsnachweis: 'h',
});
const binder = geraet({
  id: 'binder',
  bezeichnung: 'Ölbindemittel',
  verbrauchsmaterial: true,
  einheit: 'Sack',
});
const kiste = geraet({
  id: 'kiste',
  bezeichnung: 'Ölspur-Kiste',
  materialTyp: 'Set-Artikel',
  barcodes: ['SET-1'],
  verbrauchsmaterial: true,
});
const pumpe = geraet({ id: 'pumpe', bezeichnung: 'Tauchpumpe', barcodes: ['ABC123'] });
const alt = geraet({ id: 'alt', bezeichnung: 'Alter Besen', active: false });
const geraete = [besen, schaufel, binder, kiste, pumpe, alt];
const geraetById = new Map(geraete.map((g) => [g.id, g]));

const lager: GeraetBestand = {
  id: 'lager',
  geraetId: 'binder',
  lagerortKey: 'raum|feuerwehrhaus|lager',
  lagerort: { art: 'raum', standort: 'Feuerwehrhaus', raum: 'Lager' },
  anzahl: 40,
};
const srf: GeraetBestand = {
  id: 'srf',
  geraetId: 'binder',
  lagerortKey: 'fahrzeug|srf|gr 2',
  lagerort: { art: 'fahrzeug', fahrzeug: 'SRF', laderaum: 'GR 2' },
  anzahl: 3,
};
const pumpeLager: GeraetBestand = {
  id: 'pumpe-lager',
  geraetId: 'pumpe',
  lagerortKey: 'raum|feuerwehrhaus|lager',
  lagerort: { art: 'raum', standort: 'Feuerwehrhaus', raum: 'Lager' },
  anzahl: 1,
};
const bestaende = [lager, srf, pumpeLager];
const bestaendeByGeraet = new Map<string, GeraetBestand[]>([
  ['binder', [lager, srf]],
  ['pumpe', [pumpeLager]],
]);

function set(overrides: Partial<GeraetSet>): GeraetSet {
  return {
    id: 's',
    name: 'Set',
    codes: [],
    inhalt: [],
    active: true,
    createdAt: '',
    createdBy: '',
    updatedAt: '',
    updatedBy: '',
    ...overrides,
  };
}

const oelspur = set({
  id: 'oelspur',
  name: 'Ölspur',
  sybosSetArtikelId: 'kiste',
  codes: ['OEL'],
  inhalt: [{ geraetId: 'besen' }, { geraetId: 'binder', menge: 3 }, { geraetId: 'schaufel' }],
});
const hochwasser = set({
  id: 'hochwasser',
  name: 'Hochwasser',
  codes: ['HW-1'],
  inhalt: [{ geraetId: 'pumpe' }],
});
const inaktiv = set({
  id: 'inaktiv',
  name: 'Altes Set',
  codes: ['ALT'],
  inhalt: [{ geraetId: 'besen' }],
  active: false,
});

function input(overrides: Partial<GeraetSetInput> = {}): GeraetSetInput {
  return {
    name: 'Ölspur',
    codes: [],
    inhalt: [{ geraetId: 'besen' }, { geraetId: 'binder', menge: 3 }],
    active: true,
    ...overrides,
  };
}

const ctx = { geraete, sets: [oelspur, hochwasser, inaktiv], bestaende };

function codes(errors: { code: string }[]): string[] {
  return errors.map((e) => e.code);
}

describe('validateGeraetSet', () => {
  it('akzeptiert ein gültiges Set', () => {
    expect(validateGeraetSet(input(), ctx)).toEqual([]);
  });

  it('meldet fehlenden Namen und fehlenden Inhalt', () => {
    expect(codes(validateGeraetSet(input({ name: '  ', inhalt: [] }), ctx))).toEqual([
      'nameMissing',
      'noItems',
    ]);
  });

  it('meldet einen doppelten Artikel', () => {
    const errors = validateGeraetSet(
      input({ inhalt: [{ geraetId: 'besen' }, { geraetId: 'besen' }] }),
      ctx,
    );
    expect(errors).toEqual([{ code: 'duplicateItem', geraetId: 'besen' }]);
  });

  it('meldet unbekannte Artikel', () => {
    expect(validateGeraetSet(input({ inhalt: [{ geraetId: 'weg' }] }), ctx)).toEqual([
      { code: 'unknownItem', geraetId: 'weg' },
    ]);
  });

  it('meldet den Set-Artikel zugleich als Inhalt', () => {
    const errors = validateGeraetSet(
      input({ sybosSetArtikelId: 'kiste', inhalt: [{ geraetId: 'kiste' }] }),
      ctx,
    );
    expect(errors).toEqual([{ code: 'setArtikelAsItem', geraetId: 'kiste' }]);
  });

  it('meldet eine Bindung an einen Artikel, der kein Set-Artikel ist', () => {
    expect(codes(validateGeraetSet(input({ sybosSetArtikelId: 'pumpe' }), ctx))).toEqual([
      'notSetArtikel',
    ]);
    expect(codes(validateGeraetSet(input({ sybosSetArtikelId: 'weg' }), ctx))).toEqual([
      'notSetArtikel',
    ]);
  });

  it('meldet einen Lagerort eines anderen Artikels', () => {
    const errors = validateGeraetSet(
      input({ inhalt: [{ geraetId: 'binder', bestandId: 'pumpe-lager' }] }),
      ctx,
    );
    expect(errors).toEqual([{ code: 'invalidBestand', geraetId: 'binder' }]);
  });

  it('meldet einen Lagerort an einem Gerät', () => {
    const errors = validateGeraetSet(
      input({ inhalt: [{ geraetId: 'pumpe', bestandId: 'pumpe-lager' }] }),
      ctx,
    );
    expect(errors).toEqual([{ code: 'bestandNotConsumable', geraetId: 'pumpe' }]);
  });

  it('akzeptiert einen festen Lagerort des Verbrauchsmaterials', () => {
    expect(
      validateGeraetSet(input({ inhalt: [{ geraetId: 'binder', bestandId: 'srf' }] }), ctx),
    ).toEqual([]);
  });

  it('meldet eine ungültige Menge', () => {
    for (const menge of [0, -1, 1e308, Number.NaN]) {
      expect(
        validateGeraetSet(input({ inhalt: [{ geraetId: 'binder', menge }] }), ctx),
      ).toEqual([{ code: 'invalidMenge', geraetId: 'binder' }]);
    }
  });

  it('meldet einen Code, den ein Artikel trägt', () => {
    expect(validateGeraetSet(input({ codes: [' abc123 '] }), ctx)).toEqual([
      { code: 'codeCollision', value: 'abc123', kind: 'geraet', name: 'Tauchpumpe' },
    ]);
  });

  it('meldet einen Code eines anderen aktiven Sets', () => {
    expect(validateGeraetSet(input({ codes: ['hw-1'] }), ctx)).toEqual([
      { code: 'codeCollision', value: 'hw-1', kind: 'set', name: 'Hochwasser' },
    ]);
  });

  it('meldet den Code eines Set-Artikels, der an ein anderes Set gebunden ist', () => {
    expect(codes(validateGeraetSet(input({ codes: ['SET-1'] }), ctx))).toEqual([
      'codeCollision',
    ]);
  });

  it('ignoriert inaktive andere Sets und das eigene Set beim Ändern', () => {
    expect(validateGeraetSet(input({ codes: ['ALT'] }), ctx)).toEqual([]);
    expect(validateGeraetSet(input({ id: 'hochwasser', codes: ['HW-1'] }), ctx)).toEqual([]);
  });

  it('erlaubt die Codes des eigenen gebundenen Set-Artikels', () => {
    expect(
      validateGeraetSet(
        input({ id: 'oelspur', sybosSetArtikelId: 'kiste', codes: ['set-1', 'OEL'] }),
        ctx,
      ),
    ).toEqual([]);
  });
});

describe('normalizeSetCodes', () => {
  it('trimmt, fasst Leerzeichen zusammen und entfernt Dubletten ohne Rücksicht auf Groß/Klein', () => {
    expect(normalizeSetCodes([' OEL ', 'oel', '', 'A  B'])).toEqual(['OEL', 'A B']);
  });
});

describe('setCodesOf', () => {
  it('liefert eigene Codes plus die des gebundenen Set-Artikels, normalisiert', () => {
    expect(setCodesOf(oelspur, geraetById)).toEqual(['oel', 'set-1']);
    expect(setCodesOf(hochwasser, geraetById)).toEqual(['hw-1']);
  });
});

describe('findByCode', () => {
  const sets = [oelspur, hochwasser, inaktiv];

  it('findet Artikel und aktive Sets', () => {
    expect(findByCode('abc123', { geraete, sets })).toEqual([{ kind: 'geraet', geraet: pumpe }]);
    expect(findByCode(' hw-1 ', { geraete, sets })).toEqual([{ kind: 'set', set: hochwasser }]);
  });

  it('lässt inaktive Sets weg', () => {
    expect(findByCode('ALT', { geraete, sets })).toEqual([]);
  });

  it('Set gewinnt: der Code des gebundenen Set-Artikels liefert nur das Set', () => {
    expect(findByCode('set-1', { geraete, sets })).toEqual([{ kind: 'set', set: oelspur }]);
  });

  it('liefert den Set-Artikel, wenn das gebundene Set inaktiv ist', () => {
    const sets2 = [{ ...oelspur, active: false }];
    expect(findByCode('SET-1', { geraete, sets: sets2 })).toEqual([
      { kind: 'geraet', geraet: kiste },
    ]);
  });

  it('liefert nichts für einen leeren Code', () => {
    expect(findByCode('  ', { geraete, sets })).toEqual([]);
  });
});

describe('searchSets', () => {
  const sets = [oelspur, hochwasser, inaktiv];

  it('sucht über Name und Codes, alle Wörter müssen passen', () => {
    expect(searchSets(sets, 'ölspur')).toEqual([oelspur]);
    expect(searchSets(sets, 'hw-1')).toEqual([hochwasser]);
    expect(searchSets(sets, 'ölspur hw-1')).toEqual([]);
  });

  it('liefert ohne Text alle aktiven Sets', () => {
    expect(searchSets(sets, '')).toEqual([oelspur, hochwasser]);
  });
});

describe('expandSetForEinsatz', () => {
  const expandCtx = {
    geraetById,
    bestaendeByGeraet,
    vehicleNames: [] as string[],
    containerIds: [] as string[],
  };

  it('stellt den Set-Artikel als zugeordnet mit Menge 1 voran', () => {
    const { rows } = expandSetForEinsatz(oelspur, expandCtx);
    expect(rows[0]).toMatchObject({
      art: 'zugeordnet',
      menge: 1,
      fromSetArtikel: true,
      geraet: { id: 'kiste', verbrauchsmaterial: false },
    });
    expect(rows[0].bestandId).toBeUndefined();
  });

  it('übernimmt Inhalte in Set-Reihenfolge mit Art, Menge und Stunden leer', () => {
    const { rows, skipped } = expandSetForEinsatz(oelspur, expandCtx);
    expect(skipped).toEqual([]);
    expect(
      rows.slice(1).map((r) => ({ id: r.geraet.id, art: r.art, menge: r.menge, bestandId: r.bestandId })),
    ).toEqual([
      { id: 'besen', art: 'zugeordnet', menge: 1, bestandId: undefined },
      { id: 'binder', art: 'verbraucht', menge: 3, bestandId: 'lager' },
      { id: 'schaufel', art: 'zugeordnet', menge: undefined, bestandId: undefined },
    ]);
  });

  it('nimmt den festen Lagerort', () => {
    const s = set({ inhalt: [{ geraetId: 'binder', bestandId: 'lager' }] });
    const { rows } = expandSetForEinsatz(s, { ...expandCtx, vehicleNames: ['SRF Neusiedl'] });
    expect(rows.map((r) => r.bestandId)).toEqual(['lager']);
  });

  it('fällt bei verschwundenem Lagerort auf pickDefaultBestand zurück', () => {
    const s = set({ inhalt: [{ geraetId: 'binder', bestandId: 'weg' }] });
    const { rows } = expandSetForEinsatz(s, { ...expandCtx, vehicleNames: ['SRF Neusiedl'] });
    expect(rows.map((r) => r.bestandId)).toEqual(['srf']);
  });

  it('überspringt fehlende und inaktive Artikel mit Grund', () => {
    const s = set({ inhalt: [{ geraetId: 'weg' }, { geraetId: 'alt' }, { geraetId: 'besen' }] });
    const { rows, skipped } = expandSetForEinsatz(s, expandCtx);
    expect(rows.map((r) => r.geraet.id)).toEqual(['besen']);
    expect(skipped).toEqual([
      { geraetId: 'weg', reason: 'missing' },
      { geraetId: 'alt', name: 'Alter Besen', reason: 'inactive' },
    ]);
  });

  it('überspringt Verbrauchsmaterial ohne jeden Lagerort', () => {
    const s = set({ inhalt: [{ geraetId: 'binder' }] });
    const { rows, skipped } = expandSetForEinsatz(s, {
      ...expandCtx,
      bestaendeByGeraet: new Map(),
    });
    expect(rows).toEqual([]);
    expect(skipped).toEqual([{ geraetId: 'binder', name: 'Ölbindemittel', reason: 'noBestand' }]);
  });

  it('überspringt einen fehlenden Set-Artikel', () => {
    const s = set({ sybosSetArtikelId: 'weg', inhalt: [{ geraetId: 'besen' }] });
    const { rows, skipped } = expandSetForEinsatz(s, expandCtx);
    expect(rows.map((r) => r.geraet.id)).toEqual(['besen']);
    expect(skipped).toEqual([{ geraetId: 'weg', reason: 'missing' }]);
  });
});

describe('groupEntriesBySet', () => {
  function entry(id: string, overrides: Partial<GeraetEinsatz> = {}): GeraetEinsatz {
    return {
      id,
      groupId: 'ffnd',
      geraetId: id,
      geraetName: id,
      art: 'zugeordnet',
      zeitpunkt: '',
      createdAt: '',
      createdBy: '',
      ...overrides,
    };
  }
  const a = entry('a');
  const b1 = entry('b1', { setId: 'oelspur', setName: 'Ölspur', setZuordnungId: 'z1' });
  const c = entry('c');
  const b2 = entry('b2', { setId: 'oelspur', setName: 'Ölspur', setZuordnungId: 'z1' });
  const d1 = entry('d1', { setId: 'oelspur', setName: 'Ölspur', setZuordnungId: 'z2' });

  it('fasst Einträge derselben Zuordnung an der Stelle des ersten zusammen', () => {
    expect(groupEntriesBySet([a, b1, c, b2])).toEqual([
      { kind: 'entry', entry: a },
      { kind: 'set', zuordnungId: 'z1', name: 'Ölspur', entries: [b1, b2] },
      { kind: 'entry', entry: c },
    ]);
  });

  it('trennt zwei Zuordnungen desselben Sets', () => {
    expect(groupEntriesBySet([b1, d1]).map((i) => (i.kind === 'set' ? i.zuordnungId : ''))).toEqual(
      ['z1', 'z2'],
    );
  });

  it('lässt Einträge ohne Zuordnung einzeln stehen', () => {
    expect(groupEntriesBySet([a, c])).toEqual([
      { kind: 'entry', entry: a },
      { kind: 'entry', entry: c },
    ]);
  });
});
