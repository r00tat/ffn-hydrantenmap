import { describe, expect, it } from 'vitest';
import type { MelderEntry } from './melderIndex';
import type { ObjektDokument } from './objektDokument';
import { searchObjektDokumente } from './search';

const m = (kennung: string, seite: number): MelderEntry => {
  const [g, rest] = kennung.split('/');
  return {
    kennung,
    gruppe: Number(g),
    melder: parseInt(rest, 10),
    seite,
    box: [0, 0, 0.1, 0.1],
  };
};

const dok = (id: string, over: Partial<ObjektDokument>): ObjektDokument => ({
  id,
  name: `${id}.pdf`,
  contentType: 'application/pdf',
  storagePath: `risikoobjekt/ro/${id}.pdf`,
  size: 1,
  sha256: 'x',
  indexStatus: 'ok',
  createdAt: '2026-01-01',
  createdBy: 'a@example.com',
  ...over,
});

const docs = [
  dok('eg', {
    seitenText: ['Erdgeschoß Heizraum 3/05', 'Legende'],
    melder: [m('3/05', 1), m('3/06', 1), m('4/01E', 2)],
  }),
  dok('og', {
    seitenText: ['Obergeschoß Raum 12'],
    melder: [m('3/07', 1), m('12/1', 1)],
  }),
  dok('foto', { contentType: 'image/jpeg', indexStatus: 'bild' }),
];

describe('searchObjektDokumente', () => {
  it('findet einen einzelnen Melder ohne Volltextsuche', () => {
    const r = searchObjektDokumente(docs, 'MG 3 M 5');
    expect(r.query).toEqual({ gruppe: 3, melder: 5 });
    expect(r.melder).toHaveLength(1);
    expect(r.melder[0]).toMatchObject({ dokumentId: 'eg', seite: 1 });
    expect(r.melder[0].entries.map((e) => e.kennung)).toEqual(['3/05']);
    expect(r.text).toEqual([]);
  });

  it('fasst eine ganze Gruppe je Seite zusammen', () => {
    const r = searchObjektDokumente(docs, '3');
    expect(r.melder.map((x) => [x.dokumentId, x.seite, x.entries.length])).toEqual([
      ['eg', 1, 2],
      ['og', 1, 1],
    ]);
  });

  it('sucht bei einer Gruppennummer auch im Text', () => {
    const r = searchObjektDokumente(docs, '12');
    expect(r.melder.map((x) => x.dokumentId)).toEqual(['og']);
    expect(r.text.map((x) => [x.dokumentId, x.seite])).toEqual([['og', 1]]);
  });

  it('findet die Gruppe, solange die Meldernummer noch fehlt', () => {
    const r = searchObjektDokumente(docs, '3/');
    expect(r.query).toEqual({ gruppe: 3 });
    expect(r.melder.map((x) => [x.dokumentId, x.seite, x.entries.length])).toEqual([
      ['eg', 1, 2],
      ['og', 1, 1],
    ]);
  });

  it('findet Gruppen, die die Nummer enthalten, genaue Treffer zuerst', () => {
    const plan = [
      dok('a', { melder: [m('310/1', 1), m('10/1', 2), m('105/2', 1), m('10/2', 1)] }),
      dok('b', { melder: [m('10/3', 4), m('210/1', 1)] }),
    ];
    const r = searchObjektDokumente(plan, '10');
    expect(r.melder.map((x) => [x.dokumentId, x.seite, x.entries.map((e) => e.kennung)])).toEqual([
      ['a', 1, ['10/2']],
      ['a', 2, ['10/1']],
      ['b', 4, ['10/3']],
      ['a', 1, ['105/2']],
      ['a', 1, ['310/1']],
      ['b', 1, ['210/1']],
    ]);
  });

  it('sucht mit Melder nur in der genauen Gruppe', () => {
    const plan = [
      dok('a', { melder: [m('10/1E', 1), m('100/1E', 1), m('101/1E', 2), m('310/1E', 2)] }),
    ];
    const r = searchObjektDokumente(plan, '10/1E');
    expect(r.melder.map((x) => x.entries.map((e) => e.kennung))).toEqual([['10/1E']]);
    expect(searchObjektDokumente(plan, '10/').melder).toHaveLength(1);
  });

  it('sucht Wörter nur im Text', () => {
    const r = searchObjektDokumente(docs, 'heizraum');
    expect(r.query).toBeNull();
    expect(r.melder).toEqual([]);
    expect(r.text).toMatchObject([{ dokumentId: 'eg', seite: 1, count: 1 }]);
  });

  it('liefert für eine leere Eingabe nichts', () => {
    expect(searchObjektDokumente(docs, '  ')).toEqual({ query: null, melder: [], text: [] });
  });
});
