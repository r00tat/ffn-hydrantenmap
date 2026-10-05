import { describe, expect, it } from 'vitest';
import type { Geraet, GeraetEinsatz } from './geraet';
import { resolveEinsatzGeraeteForSybos } from './geraetSybosTransfer';

const entryBase = {
  groupId: 'g1',
  zeitpunkt: '2026-03-01T14:00:00',
  createdAt: '',
  createdBy: '',
} as const;

const geraetBase = {
  active: true,
  bestandGesamt: 0,
  createdAt: '',
  createdBy: '',
  updatedAt: '',
  updatedBy: '',
} as const;

const pumpe: Geraet = {
  ...geraetBase,
  id: '4711',
  externeId: '4711',
  bezeichnung: 'Tauchpumpe',
  verbrauchsmaterial: false,
  einheitVerwendungsnachweis: 'h',
};
const binder: Geraet = {
  ...geraetBase,
  id: '815',
  externeId: '815',
  bezeichnung: 'Ölbindemittel',
  verbrauchsmaterial: true,
};
const container: Geraet = {
  ...geraetBase,
  id: '73528',
  externeId: '73528',
  bezeichnung: 'Rollcontainer 1',
  kategorie: 'Container',
  verbrauchsmaterial: false,
};

describe('resolveEinsatzGeraeteForSybos', () => {
  it('liefert eine Zeile je Artikel mit summierter Anzahl bzw. Stunden', () => {
    const entries: GeraetEinsatz[] = [
      { ...entryBase, id: 'e1', geraetId: '815', geraetName: 'Ölbindemittel', art: 'verbraucht', menge: 3 },
      { ...entryBase, id: 'e2', geraetId: '815', geraetName: 'Ölbindemittel', art: 'verbraucht', menge: 2 },
      { ...entryBase, id: 'e3', geraetId: '4711', geraetName: 'Tauchpumpe', art: 'zugeordnet', stunden: 1.5 },
      { ...entryBase, id: 'e4', geraetId: '73528', geraetName: 'Rollcontainer 1', art: 'zugeordnet' },
    ];

    expect(resolveEinsatzGeraeteForSybos(entries, [pumpe, binder, container])).toEqual([
      { sybosId: '815', name: 'Ölbindemittel', typ: 'gerae', anzahl: 5, einheit: 'stk' },
      { sybosId: '73528', name: 'Rollcontainer 1', typ: 'cont' },
      { sybosId: '4711', name: 'Tauchpumpe', typ: 'gerae', anzahl: 1.5, einheit: 'h' },
    ]);
  });

  it('nimmt die Artikel-ID, wenn die Stammdaten fehlen', () => {
    const entries: GeraetEinsatz[] = [
      { ...entryBase, id: 'e1', geraetId: '99', geraetName: 'Wärmebildkamera', art: 'zugeordnet', menge: 1 },
    ];

    expect(resolveEinsatzGeraeteForSybos(entries, [])).toEqual([
      { sybosId: '99', name: 'Wärmebildkamera', typ: 'gerae', anzahl: 1, einheit: 'stk' },
    ]);
  });

  it('lässt Artikel ohne Sybos-Kennung weg — von Hand angelegte', () => {
    const manuell: Geraet = { ...binder, id: 'abcDEF123', externeId: undefined };
    const entries: GeraetEinsatz[] = [
      { ...entryBase, id: 'e1', geraetId: 'abcDEF123', geraetName: 'Eigenes', art: 'verbraucht', menge: 1 },
    ];

    expect(resolveEinsatzGeraeteForSybos(entries, [manuell])).toEqual([]);
  });
});
