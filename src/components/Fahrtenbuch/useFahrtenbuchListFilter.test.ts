// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EMPTY_FAHRTENBUCH_LIST_FILTER } from '../../common/fahrtenbuchListFilter';
import useFahrtenbuchListFilter from './useFahrtenbuchListFilter';

const searchParamsMock = { value: new URLSearchParams() };

vi.mock('next/navigation', () => ({
  useSearchParams: () => searchParamsMock.value,
}));

function setUrl(search: string) {
  window.history.replaceState(null, '', `/fahrtenbuch${search}`);
  searchParamsMock.value = new URLSearchParams(search);
}

describe('useFahrtenbuchListFilter', () => {
  beforeEach(() => setUrl(''));

  it('startet mit dem Filter aus der URL', () => {
    setUrl('?q=seepark&von=2026-08-01&fahrer=p1&defekte=1');

    const { result } = renderHook(() => useFahrtenbuchListFilter());

    expect(result.current.filter).toEqual({
      ...EMPTY_FAHRTENBUCH_LIST_FILTER,
      search: 'seepark',
      from: '2026-08-01',
      driverKey: 'p1',
      onlyDefects: true,
    });
  });

  it('schreibt eine Änderung in die URL, ohne zu navigieren', () => {
    const { result } = renderHook(() => useFahrtenbuchListFilter());

    act(() =>
      result.current.setFilter({
        ...EMPTY_FAHRTENBUCH_LIST_FILTER,
        search: 'seepark',
        zweck: 'uebung',
      }),
    );

    expect(window.location.pathname).toBe('/fahrtenbuch');
    expect(new URLSearchParams(window.location.search)).toEqual(
      new URLSearchParams({ q: 'seepark', zweck: 'uebung' }),
    );
  });

  it('räumt beim Zurücksetzen die eigenen Parameter weg und lässt fremde stehen', () => {
    setUrl('?vehicle=v1&q=seepark');

    const { result } = renderHook(() => useFahrtenbuchListFilter());
    act(() => result.current.resetFilter());

    expect(result.current.filter).toEqual(EMPTY_FAHRTENBUCH_LIST_FILTER);
    expect(window.location.search).toBe('?vehicle=v1');
  });
});
