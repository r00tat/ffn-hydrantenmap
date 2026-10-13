import { beforeEach, describe, expect, it, vi } from 'vitest';

const { guardMock, calcGet } = vi.hoisted(() => ({
  guardMock: vi.fn(),
  calcGet: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('../../app/auth', () => ({
  actionFirecallPermissionRequired: (...args: unknown[]) => guardMock(...args),
}));
vi.mock('../firebase/firestore', () => ({ FIRECALL_COLLECTION_ID: 'call' }));
vi.mock('./completePaymentAndNotify', () => ({ completePaymentAndNotify: vi.fn() }));
vi.mock('../../server/auth/baseUrl', () => ({ getBaseUrl: async () => 'https://example.org' }));
vi.mock('../../server/firebase/admin', () => ({
  firestore: {
    collection: () => ({
      doc: () => ({
        collection: () => ({ doc: () => ({ get: calcGet, update: vi.fn() }) }),
      }),
    }),
  },
}));

import {
  checkSumupPaymentStatus,
  createSumupCheckout,
  getSumupDeepLink,
} from './sumupActions';

beforeEach(() => {
  guardMock.mockReset();
  calcGet.mockReset();
});

describe('sumupActions', () => {
  it.each([
    ['createSumupCheckout', createSumupCheckout],
    ['getSumupDeepLink', getSumupDeepLink],
    ['checkSumupPaymentStatus', checkSumupPaymentStatus],
  ] as const)(
    '%s verlangt Kostenersatz in der Gruppe des Einsatzes und liest ohne nichts',
    async (_name, action) => {
      guardMock.mockRejectedValue(new Error('forbidden'));
      const result = await action('fc1', 'calc1');
      expect(guardMock).toHaveBeenCalledWith('fc1', 'kostenersatz.use');
      expect(result.success).toBe(false);
      expect(calcGet).not.toHaveBeenCalled();
    },
  );
});
