import { describe, expect, it } from 'vitest';
import type { AtemschutzTrupp } from '../../common/atemschutz';
import { ASUE_PUSH_KIND } from '../../common/atemschutzPush';
import { berechneStand } from '../../common/atemschutzUeberwachung';
import { buildUeberwachungPush, type PushKey } from './ueberwachungPushModel';

const ABMARSCH = '2026-09-02T10:00:00.000Z';

const trupp: AtemschutzTrupp = {
  id: 't1',
  truppKey: 'k1',
  laufendeNummer: 1,
  truppName: 'Trupp 1',
  feuerwehr: 'Neusiedl am See',
  mitglieder: ['Huber', 'Maier'],
  status: 'imEinsatz',
  bereitSeit: ABMARSCH,
  abmarschZeit: ABMARSCH,
  druckAbmarsch: 300,
  paTyp: 'standard300',
  createdAt: ABMARSCH,
  createdBy: 'u1',
  updatedAt: ABMARSCH,
  updatedBy: 'u1',
};

/** Gibt Schlüssel und Werte zurück, damit der Test die Vorlage nicht nachbaut. */
const t = (key: PushKey, values?: Record<string, string | number>) =>
  `${key}(${JSON.stringify(values ?? {})})`;

const uhrzeit = () => '10:26';

describe('buildUeberwachungPush', () => {
  const stand = berechneStand(trupp, new Date('2026-09-02T10:09:00.000Z'))!;

  it('nennt den Trupp im Titel und die Kennzahlen im Text', () => {
    const push = buildUeberwachungPush({
      firecallId: 'f1',
      firecallName: 'Zimmerbrand Hauptstraße',
      trupp,
      stand,
      warnung: { key: 'drittel', faelligSeit: ABMARSCH },
      t,
      uhrzeit,
    });
    expect(push.title).toBe('push.drittel({"trupp":"Neusiedl am See Trupp 1"})');
    expect(push.body).toContain('push.body(');
    expect(push.body).toContain('Zimmerbrand Hauptstraße');
    expect(push.body).toContain('10:26');
  });

  it('trägt Ziel, Trupp und Warnung in der Nutzlast', () => {
    const push = buildUeberwachungPush({
      firecallId: 'f1',
      trupp,
      stand,
      warnung: { key: 'rueckzug', faelligSeit: ABMARSCH },
      t,
      uhrzeit,
    });
    expect(push.data.kind).toBe(ASUE_PUSH_KIND);
    expect(push.data.url).toBe('/einsatz/f1/atemschutzueberwachung');
    expect(push.data.truppId).toBe('t1');
    expect(push.data.warnung).toBe('rueckzug');
    // Je Trupp und nicht je Warnung: Die neue Meldung ersetzt die alte.
    expect(push.tag).toBe('asue-t1');
  });

  it('fällt ohne Einsatznamen nicht auf „undefined" zurück', () => {
    const push = buildUeberwachungPush({
      firecallId: 'f1',
      firecallName: '   ',
      trupp,
      stand,
      warnung: { key: 'zweiDrittel', faelligSeit: ABMARSCH },
      t,
      uhrzeit,
    });
    expect(push.body).toContain('"einsatz":"—"');
  });

  it('nennt einen Trupp ohne Namen mit dem Ersatztext', () => {
    const push = buildUeberwachungPush({
      firecallId: 'f1',
      trupp: { ...trupp, feuerwehr: '', truppName: undefined },
      stand,
      warnung: { key: 'drittel', faelligSeit: ABMARSCH },
      t,
      uhrzeit,
    });
    expect(push.title).toContain('push.truppOhneName');
  });
});
