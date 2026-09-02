import { describe, expect, it } from 'vitest';
import type { AtemschutzFuellung } from '../../common/atemschutz';
import {
  buildFuellprotokollExport,
  chunkFuellprotokollExport,
  filterText,
  type FuellprotokollExportInput,
} from './fuellprotokollExportModel';

/** Gibt den Schlüssel samt Werten zurück — so ist im Test sichtbar, was das
 *  Modell beschriftet, ohne den Katalog nachzubauen. */
const t = (key: string, values?: Record<string, string | number>) =>
  values ? `${key}(${Object.values(values).join(',')})` : key;

function fuellung(over: Partial<AtemschutzFuellung> = {}): AtemschutzFuellung {
  return {
    id: 'f1',
    flaschenNummer: '2.16.19',
    feuerwehr: 'Neusiedl am See',
    anzahl: 1,
    enddruck: 300,
    gefuelltVon: 'Max Muster',
    zeitpunkt: '2026-08-02T14:35:00.000Z',
    firecallId: '',
    verrechnen: false,
    createdAt: '',
    createdBy: 'u1',
    updatedAt: '',
    updatedBy: 'u1',
    ...over,
  };
}

function input(
  over: Partial<FuellprotokollExportInput> = {},
): FuellprotokollExportInput {
  return {
    fuellungen: [fuellung()],
    from: '2026-08-01',
    to: '2026-08-31',
    timeZone: 'Europe/Vienna',
    groupName: 'FF Neusiedl am See',
    generatedAt: '2026-09-02T08:00:00.000Z',
    generatedBy: 'Paul',
    ...over,
  };
}

describe('buildFuellprotokollExport', () => {
  it('rechnet den Zeitpunkt in die Zone des Benutzers', () => {
    const model = buildFuellprotokollExport(input(), t);
    // 14:35 UTC ist im August 16:35 in Wien.
    expect(model.rows[0].cells[0]).toBe('02.08.2026\n16:35');
  });

  it('schreibt den Zeitraum in deutscher Schreibweise in den Kopf', () => {
    expect(buildFuellprotokollExport(input(), t).period).toBe(
      '01.08.2026 – 31.08.2026',
    );
  });

  it('sortiert aufsteigend — ein Nachweis wird von vorn gelesen', () => {
    const model = buildFuellprotokollExport(
      input({
        fuellungen: [
          fuellung({ id: 'b', zeitpunkt: '2026-08-03T10:00:00.000Z' }),
          fuellung({ id: 'a', zeitpunkt: '2026-08-01T10:00:00.000Z' }),
        ],
      }),
      t,
    );
    expect(model.rows.map((r) => r.cells[0])).toEqual([
      '01.08.2026\n12:00',
      '03.08.2026\n12:00',
    ]);
  });

  it('nimmt die Kennung aus den Stammdaten', () => {
    const model = buildFuellprotokollExport(
      input({
        fuellungen: [fuellung({ geraetId: 'g1', flaschenNummer: 'alt' })],
        kennungById: new Map([['g1', '2.16.20']]),
      }),
      t,
    );
    expect(model.rows[0].cells[1]).toBe('2.16.20');
  });

  it('zeigt im Anlass den Einsatz und sonst den Zweck', () => {
    const mitEinsatz = buildFuellprotokollExport(
      input({
        fuellungen: [fuellung({ firecallId: 'e1', firecallName: 'Brand K1' })],
      }),
      t,
    );
    expect(mitEinsatz.rows[0].cells[7]).toBe('Brand K1');

    const uebung = buildFuellprotokollExport(
      input({ fuellungen: [fuellung({ zweck: 'uebung' })] }),
      t,
    );
    expect(uebung.rows[0].cells[7]).toBe('zweck.uebung');
  });

  it('markiert eine Zeile mit Mangel', () => {
    const model = buildFuellprotokollExport(
      input({ fuellungen: [fuellung({ sichtkontrolle: 'mangel' })] }),
      t,
    );
    expect(model.rows[0].mangel).toBe(true);
  });

  it('weist die Summe der zu verrechnenden Flaschen gesondert aus', () => {
    const model = buildFuellprotokollExport(
      input({
        fuellungen: [
          fuellung({ id: 'a', verrechnen: true, anzahl: 3, flaschenNummer: undefined }),
          fuellung({ id: 'b' }),
        ],
      }),
      t,
    );
    expect(model.summary).toBe('fuellung.total(4) · verrechnen.summe(3)');
  });

  it('lässt die zweite Summe weg, solange nichts zu verrechnen ist', () => {
    expect(buildFuellprotokollExport(input(), t).summary).toBe(
      'fuellung.total(1)',
    );
  });

  it('setzt einen Hinweis, wenn im Zeitraum nichts gefüllt wurde', () => {
    const model = buildFuellprotokollExport(input({ fuellungen: [] }), t);
    expect(model.emptyText).toBe('fuellung.empty');
    expect(model.rows).toEqual([]);
  });
});

describe('filterText', () => {
  it('bleibt ohne Einschränkung leer', () => {
    expect(filterText({}, t)).toBeUndefined();
  });

  it('nennt „Ohne Einsatz" als eigenen Ausschnitt', () => {
    expect(filterText({ einsatzFilter: '' }, t)).toBe(
      'filter.einsatz: filter.ohneEinsatz',
    );
  });

  it('verkettet alle gesetzten Einschränkungen', () => {
    expect(
      filterText(
        { einsatzFilter: 'Brand K1', zweckFilter: 'uebung', nurVerrechnen: true },
        t,
      ),
    ).toBe(
      'filter.einsatz: Brand K1 · fuellung.zweck: zweck.uebung · verrechnen.nurZuVerrechnende',
    );
  });
});

describe('chunkFuellprotokollExport', () => {
  const model = buildFuellprotokollExport(
    input({
      fuellungen: Array.from({ length: 5 }, (_, i) =>
        fuellung({ id: `f${i}`, zeitpunkt: `2026-08-0${i + 1}T10:00:00.000Z` }),
      ),
    }),
    t,
  );

  it('lässt ein kleines Modell unangetastet', () => {
    expect(chunkFuellprotokollExport(model, 10)).toEqual([model]);
  });

  it('verteilt die Zeilen und wiederholt weder Kopf noch Summe', () => {
    const teile = chunkFuellprotokollExport(model, 2);
    expect(teile.map((p) => p.rows.length)).toEqual([2, 2, 1]);
    expect(teile[0].title).toBe(model.title);
    expect(teile[1].title).toBe('');
    expect(teile[1].period).toBe('');
    expect(teile[0].summary).toBe('');
    expect(teile[2].summary).toBe(model.summary);
    expect(teile[0].footer).toBeUndefined();
    expect(teile[2].footer).toBe(model.footer);
  });

  it('behält die Spalten in jedem Teil — sonst fehlte der Tabellenkopf', () => {
    for (const teil of chunkFuellprotokollExport(model, 2)) {
      expect(teil.columns).toEqual(model.columns);
    }
  });
});
