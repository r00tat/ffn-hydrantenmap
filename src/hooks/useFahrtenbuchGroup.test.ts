// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { LoginStatus } from './auth/types';

const loginStatus = vi.fn<() => Partial<LoginStatus>>(() => ({}));

vi.mock('./useFirebaseLogin', () => ({
  default: () => loginStatus(),
}));

const { default: useFahrtenbuchGroup } = await import('./useFahrtenbuchGroup');

const MY_GROUPS = [
  { id: 'allUsers', name: 'Alle' },
  { id: 'ffnd', name: 'FF Neusiedl' },
  { id: 'ffxy', name: 'FF Anderswo' },
];

describe('useFahrtenbuchGroup', () => {
  beforeEach(() => {
    window.localStorage.clear();
    loginStatus.mockReturnValue({
      isAuthorized: true,
      isAdmin: false,
      myGroups: MY_GROUPS,
      groupRoles: { ffnd: [], ffxy: ['kostenersatz'] },
    });
  });

  it('liefert ohne Recht alle Mandanten und lässt allUsers weg', () => {
    const { result } = renderHook(() => useFahrtenbuchGroup());
    expect(result.current.groups.map((g) => g.id)).toEqual(['ffnd', 'ffxy']);
    expect(result.current.groupId).toBe('ffnd');
  });

  it('beschränkt mit einem Recht auf die Gruppen, in denen es gilt', () => {
    const { result } = renderHook(() => useFahrtenbuchGroup('kostenersatz.use'));
    expect(result.current.groups.map((g) => g.id)).toEqual(['ffxy']);
    expect(result.current.groupId).toBe('ffxy');
  });

  it('übergeht eine gespeicherte Gruppe ohne das Recht', () => {
    window.localStorage.setItem('fahrtenbuch.group', 'ffnd');
    const { result } = renderHook(() => useFahrtenbuchGroup('kostenersatz.use'));
    expect(result.current.groupId).toBe('ffxy');
  });

  it('lässt keine Gruppe ohne das Recht auswählen', () => {
    const { result } = renderHook(() => useFahrtenbuchGroup('kostenersatz.use'));
    act(() => result.current.setGroupId('ffnd'));
    expect(result.current.groupId).toBe('ffxy');
  });

  it('liefert keine Gruppe, wenn das Recht nirgends gilt', () => {
    const { result } = renderHook(() => useFahrtenbuchGroup('gruppe.manage'));
    expect(result.current.groups).toEqual([]);
    expect(result.current.groupId).toBeUndefined();
  });
});
