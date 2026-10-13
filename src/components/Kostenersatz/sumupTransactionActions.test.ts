import { beforeEach, describe, expect, it, vi } from 'vitest';

const { actionUserRequiredMock, calculations, firecalls } = vi.hoisted(() => ({
  actionUserRequiredMock: vi.fn(),
  calculations: [] as { firecallId: string; id: string; data: Record<string, unknown> }[],
  firecalls: new Map<string, Record<string, unknown>>(),
}));

vi.mock('server-only', () => ({}));
vi.mock('../../app/auth', () => ({ actionUserRequired: actionUserRequiredMock }));
vi.mock('../firebase/firestore', () => ({ FIRECALL_COLLECTION_ID: 'call' }));
vi.mock('../../server/firebase/admin', () => ({
  firestore: {
    collectionGroup: () => ({
      where: () => ({
        get: async () => ({
          docs: calculations.map((c) => ({
            id: c.id,
            ref: { parent: { parent: { id: c.firecallId } } },
            data: () => c.data,
          })),
        }),
      }),
    }),
    collection: () => ({
      doc: (id: string) => ({ get: async () => ({ data: () => firecalls.get(id) }) }),
    }),
  },
}));

import { fetchSumupTransactions } from './sumupTransactionActions';

function calc(firecallId: string, id: string, createdAt: string) {
  calculations.push({
    firecallId,
    id,
    data: { recipient: { name: id }, totalSum: 10, sumupPaymentStatus: 'paid', createdAt },
  });
}

beforeEach(() => {
  actionUserRequiredMock.mockReset();
  calculations.length = 0;
  firecalls.clear();
  firecalls.set('fc-ffnd', { name: 'Brand Neusiedl', group: 'ffnd' });
  firecalls.set('fc-ffxy', { name: 'Brand Muster', group: 'ffxy' });
  calc('fc-ffnd', 'k1', '2026-01-02');
  calc('fc-ffxy', 'k2', '2026-01-01');
});

describe('fetchSumupTransactions', () => {
  it('liefert nur Zahlungen aus Gruppen mit Kostenersatz-Recht', async () => {
    actionUserRequiredMock.mockResolvedValue({
      user: { groupRoles: { ffnd: ['kostenersatz'], ffxy: [] } },
    });
    const rows = await fetchSumupTransactions();
    expect(rows.map((r) => r.calculationId)).toEqual(['k1']);
    expect(rows[0].firecallName).toBe('Brand Neusiedl');
  });

  it('liefert dem globalen Admin alle Zahlungen', async () => {
    actionUserRequiredMock.mockResolvedValue({ user: { isAdmin: true } });
    const rows = await fetchSumupTransactions();
    expect(rows.map((r) => r.calculationId)).toEqual(['k1', 'k2']);
  });

  it('weist ab, wer nirgends Kostenersatz hat', async () => {
    actionUserRequiredMock.mockResolvedValue({
      user: { groupRoles: { ffnd: ['gruppenadmin'] } },
    });
    await expect(fetchSumupTransactions()).rejects.toMatchObject({ status: 403 });
  });

  it('liest die alte Freischaltung in `groups` nicht mehr', async () => {
    actionUserRequiredMock.mockResolvedValue({
      user: { groups: ['ffnd', 'kostenersatz'], groupRoles: { ffnd: [] } },
    });
    await expect(fetchSumupTransactions()).rejects.toMatchObject({ status: 403 });
  });
});
