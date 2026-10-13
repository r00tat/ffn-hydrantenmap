// @vitest-environment jsdom
import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

const addFirecallItem = vi.fn(() => Promise.resolve(undefined));
vi.mock('../../hooks/useFirecallItemAdd', () => ({
  default: () => addFirecallItem,
}));
vi.mock('../../hooks/useVehicles', () => ({
  default: () => ({
    firecallItems: [{ type: 'diary', nummer: 1, name: 'Alarmierung' }],
  }),
}));

const { default: useLocationDiary } = await import('./useLocationDiary');

describe('useLocationDiary', () => {
  it('gibt Einträgen eines Vorgangs aufsteigende Nummern und Zeitstempel', () => {
    vi.useFakeTimers({ now: new Date('2026-10-13T09:00:00.000Z') });
    const { result } = renderHook(() => useLocationDiary());

    void result.current('TLF von Einsatzort Keller abgezogen');
    void result.current('TLF zu Einsatzort Seestraße 5 zugeordnet');
    vi.useRealTimers();

    const [abgezogen, zugeordnet] = addFirecallItem.mock.calls.map(
      (c) => (c as unknown[])[0] as { nummer: number; datum: string },
    );
    expect([abgezogen.nummer, zugeordnet.nummer]).toEqual([2, 3]);
    expect(abgezogen.datum < zugeordnet.datum).toBe(true);
  });
});
