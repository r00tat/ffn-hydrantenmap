import { beforeEach, describe, expect, it, vi } from 'vitest';

const offline = vi.hoisted(() => ({ value: false }));
vi.mock('../../lib/connectivity', () => ({
  isOffline: () => offline.value,
  onReconnect: () => () => {},
  checkConnectivityNow: async () => !offline.value,
}));

const planMock = vi.hoisted(() => vi.fn(async () => 'scheduled'));
vi.mock('./ueberwachungTaskAction', () => ({
  planeUeberwachungWarnung: planMock,
}));

import {
  createMemoryStorage,
  getQueuedEntries,
  processQueue,
  setQueueStorage,
} from '../../lib/offlineQueue';
import { planWarningOrQueue } from './ueberwachungWarnungQueue';

describe('planWarningOrQueue', () => {
  beforeEach(() => {
    offline.value = false;
    planMock.mockClear();
    setQueueStorage(createMemoryStorage());
  });

  it('plant online sofort', async () => {
    await expect(planWarningOrQueue('fc1', 't1')).resolves.toBe('done');
    expect(planMock).toHaveBeenCalledWith('fc1', 't1');
  });

  it('reiht offline je Trupp nur einmal ein und holt beim Reconnect nach', async () => {
    offline.value = true;
    await planWarningOrQueue('fc1', 't1');
    await planWarningOrQueue('fc1', 't1');
    await planWarningOrQueue('fc1', 't2');
    expect(planMock).not.toHaveBeenCalled();
    expect(await getQueuedEntries()).toHaveLength(2);

    offline.value = false;
    await processQueue();

    expect(planMock).toHaveBeenCalledTimes(2);
    expect(planMock).toHaveBeenCalledWith('fc1', 't1');
    expect(planMock).toHaveBeenCalledWith('fc1', 't2');
    expect(await getQueuedEntries()).toHaveLength(0);
  });
});
