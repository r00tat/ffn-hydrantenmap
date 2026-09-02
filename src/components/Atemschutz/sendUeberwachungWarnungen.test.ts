import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AtemschutzTrupp } from '../../common/atemschutz';

vi.mock('server-only', () => ({}));

const { sendMock, state } = vi.hoisted(() => ({
  sendMock: vi.fn(),
  state: {
    trupps: [] as { id: string; firecallId: string; data: AtemschutzTrupp }[],
    firecalls: {} as Record<string, Record<string, unknown> | undefined>,
    users: {} as Record<string, Record<string, unknown> | undefined>,
    updates: [] as { id: string; patch: Record<string, unknown> }[],
  },
}));

vi.mock('firebase-admin/messaging', () => ({
  getMessaging: () => ({ sendEachForMulticast: sendMock }),
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
      getAll: async (...refs: { path: string }[]) =>
        refs.map((ref) => {
          const uid = ref.path.split('/')[1];
          return { data: () => state.users[uid] };
        }),
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
  sendMock.mockReset();
  sendMock.mockResolvedValue({ successCount: 2, failureCount: 0 });
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
});
