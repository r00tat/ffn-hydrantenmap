import { describe, expect, it } from 'vitest';
import type { AtemschutzTrupp } from '../../common/atemschutz';
import {
  findTrupp,
  planTruppCommand,
  truppKontext,
  type TruppPlanContext,
} from './truppAssistant';

const JETZT = '2026-09-23T10:00:00.000Z';

function trupp(overrides: Partial<AtemschutzTrupp> = {}): AtemschutzTrupp {
  return {
    id: overrides.id ?? 'id-1',
    truppKey: overrides.truppKey ?? `key-${overrides.id ?? '1'}`,
    laufendeNummer: 1,
    feuerwehr: 'Musterdorf',
    mitglieder: ['Max Muster', 'Erika Beispiel'],
    status: 'bereit',
    bereitSeit: '2026-09-23T09:00:00.000Z',
    createdAt: '2026-09-23T09:00:00.000Z',
    createdBy: 'u0',
    updatedAt: '2026-09-23T09:00:00.000Z',
    updatedBy: 'u0',
    ...overrides,
  };
}

function ctx(trupps: AtemschutzTrupp[], extra: Partial<TruppPlanContext> = {}): TruppPlanContext {
  return {
    trupps,
    jetzt: JETZT,
    uid: 'user-1',
    newKey: () => 'neuer-key',
    ...extra,
  };
}

describe('findTrupp', () => {
  const eins = trupp({ id: 'a', truppName: 'Trupp 1', mitglieder: ['Max Huber'] });
  const zwei = trupp({ id: 'b', truppName: 'Trupp 2', mitglieder: ['Anna Gruber'], status: 'imEinsatz' });
  const elf = trupp({ id: 'c', truppName: 'Trupp 11', mitglieder: ['Otto Beispiel'] });

  it('trifft den Namen genau, auch ohne das Wort „Trupp"', () => {
    expect(findTrupp([eins, zwei, elf], 'Trupp 1')).toEqual({ trupp: eins });
    expect(findTrupp([eins, zwei, elf], '1')).toEqual({ trupp: eins });
    expect(findTrupp([eins, zwei, elf], 'trupp eins')).toMatchObject({ fehler: expect.any(String) });
  });

  it('trifft über einen Mitgliedsnamen', () => {
    expect(findTrupp([eins, zwei, elf], 'Trupp Gruber')).toEqual({ trupp: zwei });
  });

  it('rät nicht, wenn zwei Trupps passen, und nennt beide', () => {
    const a = trupp({ id: 'a', truppName: 'Angriffstrupp', mitglieder: ['Max Huber'] });
    const b = trupp({ id: 'b', truppName: 'Sicherheitstrupp', mitglieder: ['Eva Huber'] });
    const result = findTrupp([a, b], 'Huber');
    expect(result).toMatchObject({ fehler: expect.stringContaining('Angriffstrupp') });
    expect((result as { fehler: string }).fehler).toContain('Sicherheitstrupp');
  });

  it('ohne Namen nur, wenn genau ein Trupp in Frage kommt', () => {
    expect(findTrupp([eins, zwei], undefined, (t) => t.status === 'imEinsatz')).toEqual({ trupp: zwei });
    expect(findTrupp([eins, zwei], undefined)).toMatchObject({ fehler: expect.stringContaining('Trupp 1') });
  });

  it('nennt die vorhandenen Trupps, wenn nichts passt', () => {
    const result = findTrupp([eins, zwei], 'Wassertrupp');
    expect(result).toMatchObject({ fehler: expect.stringContaining('Trupp 2') });
  });

  it('übergeht abgemeldete Trupps', () => {
    const weg = trupp({ id: 'x', truppName: 'Trupp 1', status: 'abgemeldet' });
    expect(findTrupp([weg], 'Trupp 1')).toMatchObject({ fehler: expect.any(String) });
  });
});

describe('planTruppCommand — anlegen', () => {
  it('legt einen Trupp in „bereit" an, mit Zeitkontrolle beim Sprecher', () => {
    const plan = planTruppCommand(
      { kind: 'create', name: 'Trupp 3', members: ['Max Huber', 'Anna Gruber'], unit: 'RLFA' },
      ctx([], { fireDepartment: 'Musterdorf' }),
    );
    expect(plan).toMatchObject({
      ok: true,
      push: true,
      warnung: false,
      tagebuch: [],
      write: {
        art: 'add',
        data: {
          truppKey: 'neuer-key',
          laufendeNummer: 1,
          truppName: 'Trupp 3',
          feuerwehr: 'Musterdorf',
          mitglieder: ['Max Huber', 'Anna Gruber'],
          entsendetAn: 'RLFA',
          status: 'bereit',
          bereitSeit: JETZT,
          ueberwachungSeit: JETZT,
          ueberwachungUids: ['user-1'],
        },
      },
    });
  });

  it('verlangt mindestens ein Mitglied', () => {
    const plan = planTruppCommand({ kind: 'create', name: 'Trupp 3' }, ctx([], { fireDepartment: 'Musterdorf' }));
    expect(plan).toMatchObject({ ok: false });
  });

  it('nimmt die Feuerwehr der vorhandenen Trupps, wenn sie eindeutig ist', () => {
    const plan = planTruppCommand(
      { kind: 'create', members: ['Max Huber'] },
      ctx([trupp({ feuerwehr: 'Nachbarort' })]),
    );
    expect(plan).toMatchObject({ ok: true, write: { data: { feuerwehr: 'Nachbarort' } } });
  });

  it('fragt nach der Feuerwehr, wenn sie nicht feststeht', () => {
    const plan = planTruppCommand({ kind: 'create', members: ['Max Huber'] }, ctx([]));
    expect(plan).toMatchObject({ ok: false, message: expect.stringContaining('Feuerwehr') });
  });

  it('legt keinen zweiten Trupp mit demselben Namen an', () => {
    const plan = planTruppCommand(
      { kind: 'create', name: 'Trupp 1', members: ['Max Huber'] },
      ctx([trupp({ truppName: 'Trupp 1' })], { fireDepartment: 'Musterdorf' }),
    );
    expect(plan).toMatchObject({ ok: false, message: expect.stringContaining('Trupp 1') });
  });
});

describe('planTruppCommand — Statuswechsel', () => {
  it('teilt einen bereiten Trupp einer Einheit zu', () => {
    const t = trupp({ truppName: 'Trupp 1' });
    const plan = planTruppCommand(
      { kind: 'status', trupp: 'Trupp 1', status: 'zugeteilt', unit: 'TLFA', pressure: 300 },
      ctx([t]),
    );
    expect(plan).toMatchObject({
      ok: true,
      tagebuch: [],
      warnung: false,
      write: {
        art: 'update',
        truppId: 'id-1',
        patch: { status: 'zugeteilt', entsendetAn: 'TLFA', uebergabeZeit: JETZT, druckUebergabe: 300 },
      },
    });
  });

  it('schickt in den Einsatz: Auftrag ins Tagebuch, Warntermin, Push', () => {
    const t = trupp({ truppName: 'Trupp 1', status: 'zugeteilt' });
    const plan = planTruppCommand(
      {
        kind: 'status',
        trupp: 'Trupp 1',
        status: 'imEinsatz',
        pressure: 300,
        mission: 'Menschenrettung',
        target: 'Keller',
        time: '11:58',
      },
      ctx([t]),
    );
    expect(plan).toMatchObject({
      ok: true,
      tagebuch: ['auftrag'],
      warnung: true,
      push: true,
      write: {
        art: 'update',
        patch: {
          status: 'imEinsatz',
          druckAbmarsch: 300,
          auftrag: 'Menschenrettung',
          einsatzziel: 'Keller',
          ueberwachungUids: ['user-1'],
        },
      },
    });
    const patch = (plan as { write: { patch: { abmarschZeit: string } } }).write.patch;
    const abmarsch = new Date(patch.abmarschZeit);
    expect(abmarsch.getHours()).toBe(11);
    expect(abmarsch.getMinutes()).toBe(58);
  });

  it('holt zurück: Rückkehr ins Tagebuch, Warntermin neu planen', () => {
    const t = trupp({ truppName: 'Trupp 1', status: 'imEinsatz', abmarschZeit: '2026-09-23T09:30:00.000Z' });
    const plan = planTruppCommand(
      { kind: 'status', trupp: 'Trupp 1', status: 'zurueck', pressure: 120 },
      ctx([t]),
    );
    expect(plan).toMatchObject({
      ok: true,
      tagebuch: ['rueckkehr'],
      warnung: true,
      write: { art: 'update', patch: { status: 'zurueck', rueckkehrZeit: JETZT, druckRueckkehr: 120 } },
    });
  });

  it('meldet ab', () => {
    const t = trupp({ truppName: 'Trupp 1', status: 'zurueck' });
    const plan = planTruppCommand({ kind: 'status', trupp: 'Trupp 1', status: 'abgemeldet' }, ctx([t]));
    expect(plan).toMatchObject({ ok: true, write: { art: 'update', patch: { status: 'abgemeldet' } } });
  });

  it('lässt einen Trupp im Einsatz nicht abmelden', () => {
    const t = trupp({ truppName: 'Trupp 1', status: 'imEinsatz' });
    const plan = planTruppCommand({ kind: 'status', trupp: 'Trupp 1', status: 'abgemeldet' }, ctx([t]));
    expect(plan).toMatchObject({ ok: false, message: expect.stringContaining('zurück') });
  });

  it('schickt einen zurückgekehrten Trupp als neue Bereitstellung erneut hinein', () => {
    const t = trupp({ truppName: 'Trupp 1', status: 'zurueck', laufendeNummer: 1 });
    const plan = planTruppCommand({ kind: 'status', trupp: 'Trupp 1', status: 'imEinsatz' }, ctx([t]));
    expect(plan).toMatchObject({
      ok: true,
      tagebuch: ['auftrag'],
      warnung: true,
      write: {
        art: 'add',
        data: { truppKey: t.truppKey, laufendeNummer: 2, status: 'imEinsatz', abmarschZeit: JETZT },
      },
    });
  });

  it('teilt einen zurückgekehrten Trupp als neue Bereitstellung wieder zu', () => {
    const t = trupp({ truppName: 'Trupp 1', status: 'zurueck', entsendetAn: 'RLFA' });
    const plan = planTruppCommand({ kind: 'status', trupp: 'Trupp 1', status: 'zugeteilt' }, ctx([t]));
    expect(plan).toMatchObject({
      ok: true,
      write: { art: 'add', data: { laufendeNummer: 2, status: 'zugeteilt', entsendetAn: 'RLFA' } },
    });
  });

  it('stellt einen zurückgekehrten Trupp wieder bereit', () => {
    const t = trupp({ truppName: 'Trupp 1', status: 'zurueck' });
    const plan = planTruppCommand({ kind: 'status', trupp: 'Trupp 1', status: 'bereit' }, ctx([t]));
    expect(plan).toMatchObject({ ok: true, write: { art: 'add', data: { laufendeNummer: 2, status: 'bereit' } } });
  });

  it('sagt, wenn der Trupp den Zustand schon hat', () => {
    const t = trupp({ truppName: 'Trupp 1', status: 'imEinsatz' });
    const plan = planTruppCommand({ kind: 'status', trupp: 'Trupp 1', status: 'imEinsatz' }, ctx([t]));
    expect(plan).toMatchObject({ ok: false, message: expect.stringContaining('bereits') });
  });

  it('lehnt einen Druck außerhalb des Flaschenbereichs ab', () => {
    const t = trupp({ truppName: 'Trupp 1', status: 'zugeteilt' });
    const plan = planTruppCommand(
      { kind: 'status', trupp: 'Trupp 1', status: 'imEinsatz', pressure: 3000 },
      ctx([t]),
    );
    expect(plan).toMatchObject({ ok: false });
  });
});

describe('planTruppCommand — Meldung', () => {
  const imEinsatz = (overrides: Partial<AtemschutzTrupp> = {}) =>
    trupp({
      truppName: 'Trupp 1',
      status: 'imEinsatz',
      abmarschZeit: '2026-09-23T09:40:00.000Z',
      druckAbmarsch: 300,
      ...overrides,
    });

  it('trägt eine Druckabfrage ein und plant den Warntermin neu', () => {
    const plan = planTruppCommand({ kind: 'report', trupp: 'Trupp 1', pressure: 240 }, ctx([imEinsatz()]));
    expect(plan).toMatchObject({
      ok: true,
      warnung: true,
      push: false,
      tagebuch: [],
      write: { art: 'abfrage', abfrage: { druck: 240, zeitpunkt: JETZT, erfasstVon: 'user-1' } },
    });
  });

  it('nimmt ohne Namen den einzigen Trupp im Einsatz', () => {
    const bereit = trupp({ id: 'b', truppName: 'Trupp 2' });
    const plan = planTruppCommand({ kind: 'report', pressure: 240 }, ctx([imEinsatz(), bereit]));
    expect(plan).toMatchObject({ ok: true, trupp: { id: 'id-1' } });
  });

  it('eine Notiz ist eine Meldung ohne Druck, mit Tagebuch nur auf Wunsch', () => {
    const plan = planTruppCommand(
      { kind: 'report', trupp: 'Trupp 1', note: 'starke Verrauchung', logToDiary: true },
      ctx([imEinsatz()]),
    );
    expect(plan).toMatchObject({
      ok: true,
      tagebuch: ['meldung'],
      write: { art: 'abfrage', abfrage: { bemerkung: 'starke Verrauchung' } },
    });
    expect((plan as { write: { abfrage: object } }).write.abfrage).not.toHaveProperty('druck');
  });

  it('Ankunft und Rückzug gehen immer ins Tagebuch, die Meldung dann nicht zusätzlich', () => {
    const plan = planTruppCommand(
      { kind: 'report', trupp: 'Trupp 1', pressure: 260, atTarget: true, logToDiary: true },
      ctx([imEinsatz()]),
    );
    expect(plan).toMatchObject({ ok: true, tagebuch: ['amZiel'] });
  });

  it('verlangt einen Inhalt', () => {
    const plan = planTruppCommand({ kind: 'report', trupp: 'Trupp 1' }, ctx([imEinsatz()]));
    expect(plan).toMatchObject({ ok: false });
  });

  it('nimmt Meldungen nur von Trupps im Einsatz', () => {
    const plan = planTruppCommand(
      { kind: 'report', trupp: 'Trupp 1', pressure: 200 },
      ctx([trupp({ truppName: 'Trupp 1', status: 'zugeteilt' })]),
    );
    expect(plan).toMatchObject({ ok: false, message: expect.stringContaining('nicht im Einsatz') });
  });

  describe('Plausibilität', () => {
    const letzte = imEinsatz({
      abfragen: [{ zeitpunkt: '2026-09-23T09:50:00.000Z', druck: 240 }],
    });

    it.each([
      ['gestiegener Druck', { pressure: 260 }, 'gestiegen'],
      ['Sprung über 100 bar', { pressure: 120 }, '120 bar'],
      ['mehr, als eine Flasche fasst', { pressure: 350 }, '350'],
    ])('fragt zurück bei %s', (_label, input, erwartet) => {
      const plan = planTruppCommand({ kind: 'report', trupp: 'Trupp 1', ...input }, ctx([letzte]));
      expect(plan).toMatchObject({ ok: false, message: expect.stringContaining(erwartet) });
      expect((plan as { message: string }).message).toContain('trotzdem');
    });

    it('vergleicht mit dem Abmarschdruck, solange es keine Abfrage gibt', () => {
      const plan = planTruppCommand({ kind: 'report', trupp: 'Trupp 1', pressure: 310 }, ctx([imEinsatz()]));
      expect(plan).toMatchObject({ ok: false, message: expect.stringContaining('300') });
    });

    it('fragt zurück bei einer zweiten Ankunft und einem zweiten Rückzug', () => {
      const gemeldet = imEinsatz({
        abfragen: [{ zeitpunkt: '2026-09-23T09:50:00.000Z', druck: 250, amZiel: true, rueckzug: true }],
      });
      expect(
        planTruppCommand({ kind: 'report', trupp: 'Trupp 1', atTarget: true }, ctx([gemeldet])),
      ).toMatchObject({ ok: false });
      expect(
        planTruppCommand({ kind: 'report', trupp: 'Trupp 1', withdrawing: true }, ctx([gemeldet])),
      ).toMatchObject({ ok: false });
    });

    it('schreibt nach Bestätigung trotzdem', () => {
      const plan = planTruppCommand(
        { kind: 'report', trupp: 'Trupp 1', pressure: 260, recordAnyway: true },
        ctx([letzte]),
      );
      expect(plan).toMatchObject({ ok: true, write: { abfrage: { druck: 260 } } });
    });

    it('lässt einen gewöhnlichen Abfall durch', () => {
      const plan = planTruppCommand({ kind: 'report', trupp: 'Trupp 1', pressure: 200 }, ctx([letzte]));
      expect(plan).toMatchObject({ ok: true });
    });
  });
});

describe('truppKontext', () => {
  it('fasst die laufenden Trupps knapp zusammen und lässt abgemeldete weg', () => {
    const t = trupp({
      truppName: 'Trupp 1',
      status: 'imEinsatz',
      entsendetAn: 'RLFA',
      abmarschZeit: '2026-09-23T09:40:00.000Z',
      druckAbmarsch: 300,
      abfragen: [
        { zeitpunkt: '2026-09-23T09:50:00.000Z', druck: 240, amZiel: true },
        { zeitpunkt: '2026-09-23T09:55:00.000Z', bemerkung: 'Verrauchung' },
      ],
    });
    const weg = trupp({ id: 'w', truppName: 'Trupp 9', status: 'abgemeldet' });
    expect(truppKontext([t, weg])).toEqual([
      {
        name: 'Trupp 1',
        feuerwehr: 'Musterdorf',
        mitglieder: ['Max Muster', 'Erika Beispiel'],
        status: 'imEinsatz',
        einheit: 'RLFA',
        abmarsch: '2026-09-23T09:40:00.000Z',
        letzterDruck: 240,
        letzterDruckZeit: '2026-09-23T09:50:00.000Z',
        amZiel: true,
        rueckzug: false,
      },
    ]);
  });
});
