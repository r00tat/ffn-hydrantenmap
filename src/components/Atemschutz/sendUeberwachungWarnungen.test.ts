import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AtemschutzTrupp } from '../../common/atemschutz';

vi.mock('server-only', () => ({}));

const { sendMock, planeMock, state } = vi.hoisted(() => ({
  sendMock: vi.fn(),
  planeMock: vi.fn(),
  state: {
    trupps: [] as { id: string; firecallId: string; data: AtemschutzTrupp }[],
    firecalls: {} as Record<string, Record<string, unknown> | undefined>,
    users: {} as Record<string, Record<string, unknown> | undefined>,
    updates: [] as { id: string; patch: Record<string, unknown> }[],
    /** Die Pfade, die `getAll` bekommen hat — für die Pfadprüfung der uids. */
    gelesenePfade: [] as string[],
    /** Lässt `ref.update` scheitern. */
    updateFehler: undefined as Error | undefined,
    /** Lässt das Lesen der Empfänger scheitern. */
    getAllFehler: undefined as Error | undefined,
  },
}));

vi.mock('firebase-admin/messaging', () => ({
  getMessaging: () => ({ sendEachForMulticast: sendMock }),
}));

vi.mock('../../server/atemschutz/ueberwachungTasks', () => ({
  planeUeberwachungTask: planeMock,
}));

vi.mock('../../server/firebase/admin', () => {
  const truppSnapshot = () => ({
    size: state.trupps.length,
    docs: state.trupps.map((t) => ({
      id: t.id,
      data: () => t.data,
      ref: {
        parent: { parent: { id: t.firecallId } },
        update: async (patch: Record<string, unknown>) => {
          if (state.updateFehler) throw state.updateFehler;
          state.updates.push({ id: t.id, patch });
        },
      },
    })),
  });

  return {
    firestore: {
      collectionGroup: () => ({
        where: () => ({ get: async () => truppSnapshot() }),
      }),
      collection: (name: string) => ({
        doc: (id: string) => ({
          // Der Pfad dient dem Mock von `getAll` als Schlüssel.
          path: `${name}/${id}`,
          get: async () => {
            const data = state.firecalls[id];
            return { exists: !!data, data: () => data };
          },
        }),
      }),
      getAll: async (...refs: { path: string }[]) => {
        if (state.getAllFehler) throw state.getAllFehler;
        state.gelesenePfade.push(...refs.map((ref) => ref.path));
        return refs.map((ref) => {
          const uid = ref.path.split('/')[1];
          return { data: () => state.users[uid] };
        });
      },
    },
  };
});

import { sendUeberwachungWarnungen } from './sendUeberwachungWarnungen';

const ABMARSCH = '2026-09-02T10:00:00.000Z';
/** 20 Minuten nach dem Abmarsch: zwei Drittel und Rückzugsvorlauf sind um. */
const JETZT = new Date('2026-09-02T10:24:00.000Z');

function trupp(over: Partial<AtemschutzTrupp> = {}): AtemschutzTrupp {
  return {
    truppKey: 'k1',
    laufendeNummer: 1,
    truppName: 'Trupp 1',
    feuerwehr: 'Neusiedl am See',
    mitglieder: ['Huber'],
    status: 'imEinsatz',
    bereitSeit: ABMARSCH,
    abmarschZeit: ABMARSCH,
    druckAbmarsch: 300,
    paTyp: 'standard300',
    ueberwachungUids: ['u1'],
    createdAt: ABMARSCH,
    createdBy: 'u1',
    updatedAt: ABMARSCH,
    updatedBy: 'u1',
    ...over,
  };
}

const optionen = {
  jetzt: JETZT,
  t: (key: string) => key,
  uhrzeit: () => '10:26',
} as unknown as Parameters<typeof sendUeberwachungWarnungen>[0];

beforeEach(() => {
  state.trupps = [];
  state.firecalls = { f1: { name: 'Zimmerbrand' } };
  state.users = { u1: { messaging: ['tok-1', 'tok-2'] } };
  state.updates = [];
  state.gelesenePfade = [];
  state.updateFehler = undefined;
  state.getAllFehler = undefined;
  sendMock.mockReset();
  sendMock.mockResolvedValue({ successCount: 2, failureCount: 0 });
  planeMock.mockReset();
  planeMock.mockResolvedValue({ status: 'planned' });
});

describe('sendUeberwachungWarnungen', () => {
  it('verschickt die dringlichste Warnung und vermerkt alle offenen', async () => {
    state.trupps = [{ id: 't1', firecallId: 'f1', data: trupp() }];

    const result = await sendUeberwachungWarnungen(optionen);

    expect(result.geprueft).toBe(1);
    expect(result.results).toHaveLength(1);
    expect(result.results[0].status).toBe('sent');
    expect(result.results[0].warnung).toBe('rueckzug');
    expect(sendMock).toHaveBeenCalledTimes(1);
    expect(sendMock.mock.calls[0][0].tokens).toEqual(['tok-1', 'tok-2']);
    // Die überholten Erinnerungen sind mit der dringlicheren Meldung erledigt.
    expect(Object.keys(state.updates[0].patch).sort()).toEqual([
      'warnungen.drittel',
      'warnungen.rueckzug',
      'warnungen.zweiDrittel',
    ]);
  });

  it('plant den nächsten Termin mit dem eben geschriebenen Vermerk', async () => {
    state.trupps = [{ id: 't1', firecallId: 'f1', data: trupp() }];

    const result = await sendUeberwachungWarnungen(optionen);

    expect(result.tasks).toHaveLength(1);
    expect(planeMock).toHaveBeenCalledTimes(1);
    // Ohne den Nachtrag am gelesenen Objekt plante der Lauf genau die Warnung
    // erneut, die er gerade verschickt hat.
    expect(planeMock.mock.calls[0][0].trupp.warnungen).toMatchObject({
      drittel: expect.any(String),
      zweiDrittel: expect.any(String),
      rueckzug: expect.any(String),
    });
  });

  it('plant auch für einen Trupp ohne fällige Warnung', async () => {
    // Genau dieser Trupp braucht den Termin: Er ist gerade abmarschiert.
    state.trupps = [
      {
        id: 't1',
        firecallId: 'f1',
        data: trupp({ abmarschZeit: JETZT.toISOString() }),
      },
    ];

    const result = await sendUeberwachungWarnungen(optionen);

    expect(result.results).toHaveLength(0);
    expect(result.tasks).toHaveLength(1);
    expect(planeMock).toHaveBeenCalledTimes(1);
  });

  it('legt im dryRun keine Aufgabe an', async () => {
    state.trupps = [{ id: 't1', firecallId: 'f1', data: trupp() }];

    const result = await sendUeberwachungWarnungen({
      ...optionen,
      dryRun: true,
    });

    expect(result.tasks).toHaveLength(0);
    expect(planeMock).not.toHaveBeenCalled();
  });

  it('schweigt, wenn die Warnung schon verschickt wurde', async () => {
    state.trupps = [
      {
        id: 't1',
        firecallId: 'f1',
        data: trupp({
          warnungen: {
            drittel: ABMARSCH,
            zweiDrittel: ABMARSCH,
            rueckzug: ABMARSCH,
          },
        }),
      },
    ];

    const result = await sendUeberwachungWarnungen(optionen);

    expect(result.results).toEqual([]);
    expect(sendMock).not.toHaveBeenCalled();
  });

  it('vermerkt nichts, solange kein Gerät registriert ist', async () => {
    state.users = {};
    state.trupps = [{ id: 't1', firecallId: 'f1', data: trupp() }];

    const result = await sendUeberwachungWarnungen(optionen);

    expect(result.results[0].status).toBe('noRecipient');
    expect(state.updates).toEqual([]);
    expect(sendMock).not.toHaveBeenCalled();
  });

  it('überspringt einen gelöschten Einsatz', async () => {
    state.firecalls = { f1: { name: 'Zimmerbrand', deleted: true } };
    state.trupps = [{ id: 't1', firecallId: 'f1', data: trupp() }];

    const result = await sendUeberwachungWarnungen(optionen);

    expect(result.results).toEqual([]);
    expect(sendMock).not.toHaveBeenCalled();
  });

  it('verschickt im dryRun nichts und liefert den Text', async () => {
    state.trupps = [{ id: 't1', firecallId: 'f1', data: trupp() }];

    const result = await sendUeberwachungWarnungen({
      ...optionen,
      dryRun: true,
    });

    expect(result.results[0].status).toBe('dryRun');
    expect(result.results[0].title).toBe('push.rueckzug');
    expect(sendMock).not.toHaveBeenCalled();
    expect(state.updates).toEqual([]);
  });

  it('lässt einen Fehler an einem Trupp den Lauf nicht beenden', async () => {
    state.trupps = [
      { id: 't1', firecallId: 'f1', data: trupp() },
      { id: 't2', firecallId: 'f1', data: trupp({ truppName: 'Trupp 2' }) },
    ];
    sendMock.mockRejectedValueOnce(new Error('FCM weg'));

    const result = await sendUeberwachungWarnungen(optionen);

    expect(result.results.map((r) => r.status)).toEqual(['failed', 'sent']);
    expect(result.results[0].error).toBe('FCM weg');
  });

  it('vermerkt nichts, wenn kein Gerät erreicht wurde', async () => {
    // `sendEachForMulticast` wirft nicht, wenn alle Token abgelehnt werden —
    // es meldet das in `successCount`. Ohne die Prüfung wäre die Warnung
    // vermerkt und käme nie wieder.
    state.trupps = [{ id: 't1', firecallId: 'f1', data: trupp() }];
    sendMock.mockResolvedValue({
      successCount: 0,
      failureCount: 2,
      responses: [{ success: false, error: new Error('token abgelaufen') }],
    });

    const result = await sendUeberwachungWarnungen(optionen);

    expect(result.results[0].status).toBe('failed');
    expect(result.results[0].error).toBe('keinGeraetErreicht');
    expect(state.updates).toEqual([]);
  });

  it('meldet einen fehlgeschlagenen Vermerk getrennt vom Versand', async () => {
    // Sonst sähe „verschickt, aber nicht vermerkt" wie „nicht verschickt" aus,
    // und die Wiederholung in der nächsten Minute wäre nicht erklärbar.
    state.trupps = [{ id: 't1', firecallId: 'f1', data: trupp() }];
    state.updateFehler = new Error('Firestore weg');

    const result = await sendUeberwachungWarnungen(optionen);

    expect(result.results[0].status).toBe('sentUnrecorded');
    expect(sendMock).toHaveBeenCalledTimes(1);
  });

  it('setzt eine krumme uid nicht zu einem Pfad zusammen', async () => {
    // `ueberwachungUids` darf jeder schreiben, der am Einsatz schreiben darf.
    // `foo/geheim/bar` würde sonst `user/foo/geheim/bar` lesen.
    state.trupps = [
      {
        id: 't1',
        firecallId: 'f1',
        data: trupp({ ueberwachungUids: ['foo/geheim/bar', '..', 'u1'] }),
      },
    ];

    const result = await sendUeberwachungWarnungen(optionen);

    expect(state.gelesenePfade).toEqual(['user/u1']);
    expect(result.results[0].status).toBe('sent');
  });

  it('hält beim Lesen der Empfänger nur diesen Trupp auf', async () => {
    // Vorher lag der Aufruf außerhalb der Fehlerbehandlung je Trupp: Ein
    // krummer Eintrag hätte die Warnungen aller anderen Trupps mitgenommen.
    state.trupps = [
      { id: 't1', firecallId: 'f1', data: trupp() },
      { id: 't2', firecallId: 'f1', data: trupp({ truppName: 'Trupp 2' }) },
    ];
    state.getAllFehler = new Error('Pfad unbrauchbar');

    const result = await sendUeberwachungWarnungen(optionen);

    expect(result.results.map((r) => r.status)).toEqual(['failed', 'failed']);
    expect(result.geprueft).toBe(2);
  });

  it('kappt die Token bei der Grenze von sendEachForMulticast', async () => {
    // Mehr als 500 Token weist FCM komplett ab — eine Warnung, die an gar
    // niemanden geht, wäre die schlechteste aller Antworten.
    state.users = {
      u1: { messaging: Array.from({ length: 620 }, (_, i) => `tok-${i}`) },
    };
    state.trupps = [{ id: 't1', firecallId: 'f1', data: trupp() }];

    const result = await sendUeberwachungWarnungen(optionen);

    expect(sendMock.mock.calls[0][0].tokens).toHaveLength(500);
    expect(result.results[0].tokenCount).toBe(500);
  });
});
