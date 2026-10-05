// @vitest-environment jsdom
import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  online: true,
  getAlarm: vi.fn(),
}));

vi.mock('../../../hooks/useOnline', () => ({
  default: () => mocks.online,
}));

vi.mock('../../../app/blaulicht-sms/actions', () => ({
  getBlaulichtSmsAlarmById: mocks.getAlarm,
}));

vi.mock('../../firebase/firestore', () => ({
  firecallAlarmIds: (fc: { alarmIds?: string[] }) => fc.alarmIds ?? [],
}));

vi.mock('../../../hooks/useAtemschutzEinsatzdaten', () => ({ default: vi.fn() }));
vi.mock('../../../hooks/useAtemschutzGeraete', () => ({ default: vi.fn() }));
vi.mock('../../../hooks/useFirebaseLogin', () => ({ default: () => ({ groups: [] }) }));
vi.mock('../../../hooks/useGeraete', () => ({
  default: () => ({ geraete: [], bestandById: new Map() }),
}));
vi.mock('../../Geraete/einsatz/useGeraetEinsatz', () => ({ default: () => ({ entries: [] }) }));

import type { Firecall } from '../../firebase/firestore';
import { useFirecallAlarms } from './useEinsatzReport';

const firecall = { id: 'fc1', group: 'g1', alarmIds: ['a1'] } as unknown as Firecall;

describe('useFirecallAlarms', () => {
  beforeEach(() => {
    mocks.online = true;
    mocks.getAlarm.mockReset();
    mocks.getAlarm.mockResolvedValue({ alarmId: 'a1', alarmText: 'Brand' });
  });

  it('lädt die zugeordneten Alarmierungen', async () => {
    const { result } = renderHook(() => useFirecallAlarms(firecall));
    await waitFor(() => expect(result.current).toHaveLength(1));
    expect(mocks.getAlarm).toHaveBeenCalledWith('g1', 'a1');
  });

  // Die Server Action ginge offline ins Leere; nach dem Reconnect wird
  // nachgeholt.
  it('fragt offline nicht an und holt es nach dem Reconnect nach', async () => {
    mocks.online = false;
    const { result, rerender } = renderHook(() => useFirecallAlarms(firecall));
    expect(mocks.getAlarm).not.toHaveBeenCalled();
    expect(result.current).toEqual([]);

    mocks.online = true;
    rerender();
    await waitFor(() => expect(result.current).toHaveLength(1));
  });
});
