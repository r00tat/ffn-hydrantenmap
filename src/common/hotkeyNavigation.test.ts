import { describe, expect, it } from 'vitest';
import {
  NAVIGATION_HOTKEY_TARGETS,
  isMapPath,
  isNavigationHotkey,
  navigationHref,
} from './hotkeyNavigation';
import { HOTKEY_ACTIONS } from './hotkeys';

describe('navigationHref', () => {
  it('points into the selected firecall', () => {
    expect(navigationHref({ href: '/', section: '' }, 'abc')).toBe('/einsatz/abc');
    expect(navigationHref({ href: '/tagebuch', section: 'tagebuch' }, 'abc')).toBe(
      '/einsatz/abc/tagebuch',
    );
  });

  it('uses the plain page without a firecall or without a section', () => {
    expect(navigationHref({ href: '/tagebuch', section: 'tagebuch' }, 'unknown')).toBe(
      '/tagebuch',
    );
    expect(navigationHref({ href: '/fahrtenbuch' }, 'abc')).toBe('/fahrtenbuch');
  });
});

describe('NAVIGATION_HOTKEY_TARGETS', () => {
  it('covers every navigation action of the catalog', () => {
    const ids = HOTKEY_ACTIONS.filter((a) => a.group === 'navigation').map((a) => a.id);
    expect(ids.every(isNavigationHotkey)).toBe(true);
    expect(Object.keys(NAVIGATION_HOTKEY_TARGETS).sort()).toEqual([...ids].sort());
  });
});

describe('isMapPath', () => {
  it('recognises the map pages only', () => {
    expect(isMapPath('/')).toBe(true);
    expect(isMapPath('/einsatz/abc')).toBe(true);
    expect(isMapPath('/einsatz/abc/tagebuch')).toBe(false);
    expect(isMapPath('/tagebuch')).toBe(false);
  });
});
