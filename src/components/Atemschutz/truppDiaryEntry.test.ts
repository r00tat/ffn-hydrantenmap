import { describe, expect, it } from 'vitest';
import type { AtemschutzTrupp } from '../../common/atemschutz';
import { buildTruppDiaryEntry, type TruppDiaryLabels } from './truppDiaryEntry';

/**
 * Etiketten, die ihre Bausteine ausgeben statt sie zu übersetzen: Geprüft wird
 * der **Aufbau** des Eintrags — welche Zeilen entstehen, in welcher Reihenfolge
 * und was wegfällt. Die Wörter selbst kommen aus `messages/*.json`.
 */
const labels: TruppDiaryLabels = {
  auftrag: (v) => `AUFTRAG|${v.trupp}|${v.auftrag ?? ''}|${v.ziel ?? ''}`,
  amZiel: (v) => `ZIEL|${v.trupp}|${v.ziel ?? ''}`,
  rueckzug: (v) => `RUECKZUG|${v.trupp}`,
  rueckkehr: (v) => `ZURUECK|${v.trupp}|${v.einheit ?? ''}`,
  meldung: (v) => `MELDUNG|${v.trupp}|${v.text ?? ''}`,
  druck: (bar) => `Druck: ${bar} bar`,
  abmarschdruck: (bar) => `Abmarschdruck: ${bar} bar`,
  einsatzdauer: (min) => `Einsatzdauer: ${min} min`,
};

const trupp: AtemschutzTrupp = {
  id: 't1',
  truppKey: 'k1',
  laufendeNummer: 1,
  truppName: '1',
  feuerwehr: 'AS-Trupp Neusiedl',
  mitglieder: ['Huber', 'Sepp', 'Maier'],
  status: 'imEinsatz',
  bereitSeit: '2026-09-03T08:00:00.000Z',
  entsendetAn: 'LFA',
  auftrag: 'Menschenrettung',
  einsatzziel: 'Keller Stiegenhaus links',
  abmarschZeit: '2026-09-03T08:00:00.000Z',
  druckAbmarsch: 300,
  createdAt: '',
  createdBy: '',
  updatedAt: '',
  updatedBy: '',
};

const zeilen = (beschreibung?: string) => (beschreibung ?? '').split('\n');

describe('buildTruppDiaryEntry', () => {
  it('baut den Einsatzauftrag mit Einheit, Mitgliedern und Abmarschdruck', () => {
    const eintrag = buildTruppDiaryEntry({
      anlass: 'auftrag',
      trupp,
      zeitpunkt: '2026-09-03T08:00:00.000Z',
      labels,
    });
    expect(eintrag.type).toBe('diary');
    expect(eintrag.art).toBe('M');
    expect(eintrag.datum).toBe('2026-09-03T08:00:00.000Z');
    expect(eintrag.von).toBe('AS-Trupp Neusiedl 1');
    expect(eintrag.an).toBe('LFA');
    expect(eintrag.name).toBe(
      'AUFTRAG|AS-Trupp Neusiedl 1|Menschenrettung|Keller Stiegenhaus links',
    );
    expect(zeilen(eintrag.beschreibung)).toEqual([
      'LFA',
      'Huber, Sepp, Maier',
      'Abmarschdruck: 300 bar',
    ]);
  });

  it('lässt das Ziel beim Auftrag aus der Anmerkung — es steht im Satz', () => {
    const eintrag = buildTruppDiaryEntry({
      anlass: 'auftrag',
      trupp,
      zeitpunkt: '2026-09-03T08:00:00.000Z',
      labels,
    });
    expect(eintrag.beschreibung).not.toContain('Keller Stiegenhaus links');
  });

  it('reicht fehlenden Auftrag und fehlendes Ziel als leer durch', () => {
    const eintrag = buildTruppDiaryEntry({
      anlass: 'auftrag',
      trupp: { ...trupp, auftrag: undefined, einsatzziel: '  ' },
      zeitpunkt: '2026-09-03T08:00:00.000Z',
      labels,
    });
    expect(eintrag.name).toBe('AUFTRAG|AS-Trupp Neusiedl 1||');
  });

  it('baut die Ankunft mit dem Druck der Meldung', () => {
    const eintrag = buildTruppDiaryEntry({
      anlass: 'amZiel',
      trupp,
      abfrage: {
        zeitpunkt: '2026-09-03T08:06:00.000Z',
        druck: 240,
        amZiel: true,
      },
      zeitpunkt: '2026-09-03T08:06:00.000Z',
      labels,
    });
    expect(eintrag.name).toBe(
      'ZIEL|AS-Trupp Neusiedl 1|Keller Stiegenhaus links',
    );
    expect(zeilen(eintrag.beschreibung)).toEqual(['LFA', 'Druck: 240 bar']);
  });

  it('nennt beim Rückzug das Ziel in der Anmerkung — im Satz steht es nicht', () => {
    const eintrag = buildTruppDiaryEntry({
      anlass: 'rueckzug',
      trupp,
      abfrage: {
        zeitpunkt: '2026-09-03T08:18:00.000Z',
        druck: 180,
        rueckzug: true,
      },
      zeitpunkt: '2026-09-03T08:18:00.000Z',
      labels,
    });
    expect(eintrag.name).toBe('RUECKZUG|AS-Trupp Neusiedl 1');
    expect(zeilen(eintrag.beschreibung)).toEqual([
      'LFA',
      'Keller Stiegenhaus links',
      'Druck: 180 bar',
    ]);
  });

  it('rechnet bei der Rückkehr die Einsatzdauer aus', () => {
    const eintrag = buildTruppDiaryEntry({
      anlass: 'rueckkehr',
      trupp: {
        ...trupp,
        status: 'zurueck',
        rueckkehrZeit: '2026-09-03T08:22:00.000Z',
        druckRueckkehr: 90,
      },
      zeitpunkt: '2026-09-03T08:22:00.000Z',
      labels,
    });
    expect(eintrag.name).toBe('ZURUECK|AS-Trupp Neusiedl 1|LFA');
    expect(zeilen(eintrag.beschreibung)).toEqual([
      'LFA',
      'Keller Stiegenhaus links',
      'Druck: 90 bar',
      'Einsatzdauer: 22 min',
    ]);
  });

  it('setzt die Bemerkung einer Statusmeldung in den Satz, nicht darunter', () => {
    const eintrag = buildTruppDiaryEntry({
      anlass: 'meldung',
      trupp,
      abfrage: {
        zeitpunkt: '2026-09-03T08:12:00.000Z',
        druck: 160,
        bemerkung: 'starke Verrauchung',
      },
      zeitpunkt: '2026-09-03T08:12:00.000Z',
      labels,
    });
    expect(eintrag.name).toBe('MELDUNG|AS-Trupp Neusiedl 1|starke Verrauchung');
    expect(zeilen(eintrag.beschreibung)).toEqual([
      'LFA',
      'Keller Stiegenhaus links',
      'Druck: 160 bar',
    ]);
  });

  it('lässt weg, was fehlt — keine Zeile „Druck: —"', () => {
    const eintrag = buildTruppDiaryEntry({
      anlass: 'rueckzug',
      trupp: { ...trupp, entsendetAn: undefined, einsatzziel: undefined },
      abfrage: { zeitpunkt: '2026-09-03T08:18:00.000Z', rueckzug: true },
      zeitpunkt: '2026-09-03T08:18:00.000Z',
      labels,
    });
    expect(eintrag.beschreibung).toBe('');
    expect('an' in eintrag).toBe(false);
  });
});
