import { describe, expect, it } from 'vitest';
import {
  HOTKEY_ACTIONS,
  bindingFromEvent,
  findConflicts,
  formatBinding,
  matchesBinding,
  normalizeBinding,
  parseBinding,
  resolveBindings,
} from './hotkeys';

type KeyInit = Partial<
  Pick<
    KeyboardEvent,
    'key' | 'code' | 'altKey' | 'ctrlKey' | 'metaKey' | 'shiftKey'
  >
>;

function key(init: KeyInit) {
  return {
    key: '',
    code: '',
    altKey: false,
    ctrlKey: false,
    metaKey: false,
    shiftKey: false,
    ...init,
  };
}

describe('parseBinding', () => {
  it('reads modifiers and a key', () => {
    expect(parseBinding('Alt+Shift+B')).toEqual({
      key: 'b',
      alt: true,
      ctrl: false,
      meta: false,
      shift: true,
    });
  });

  it('reads a single character', () => {
    expect(parseBinding('/')).toMatchObject({ key: '/', shift: false });
  });

  it('reads named keys', () => {
    expect(parseBinding('ctrl+F1')).toMatchObject({ key: 'F1', ctrl: true });
  });

  it('rejects empty or modifier-only input', () => {
    expect(parseBinding('')).toBeNull();
    expect(parseBinding('Shift')).toBeNull();
    expect(parseBinding('Alt+')).toBeNull();
  });
});

describe('normalizeBinding / formatBinding', () => {
  it('orders modifiers canonically', () => {
    expect(normalizeBinding('shift+alt+b')).toBe('Alt+Shift+B');
    expect(normalizeBinding('meta+ctrl+k')).toBe('Ctrl+Meta+K');
  });

  it('keeps punctuation as it is', () => {
    expect(normalizeBinding('?')).toBe('?');
  });

  it('formats for display with mac symbols', () => {
    expect(formatBinding('Alt+Shift+B', { mac: true })).toBe('⌥⇧B');
    expect(formatBinding('Alt+Shift+B', { mac: false })).toBe('Alt+Shift+B');
  });
});

describe('matchesBinding', () => {
  it('matches a plain letter case-insensitively but not with shift', () => {
    expect(matchesBinding(key({ key: 'm', code: 'KeyM' }), 'M')).toBe(true);
    expect(
      matchesBinding(key({ key: 'M', code: 'KeyM', shiftKey: true }), 'M'),
    ).toBe(false);
    expect(
      matchesBinding(key({ key: 'M', code: 'KeyM', shiftKey: true }), 'Shift+M'),
    ).toBe(true);
  });

  it('falls back to the physical key when Alt changes the character (macOS)', () => {
    // Option+Shift+B liefert auf dem Mac "ı" statt "B".
    expect(
      matchesBinding(
        key({ key: 'ı', code: 'KeyB', altKey: true, shiftKey: true }),
        'Alt+Shift+B',
      ),
    ).toBe(true);
  });

  it('ignores shift for punctuation that needs it on some layouts', () => {
    // "/" ist auf der deutschen Tastatur Umschalt+7.
    expect(
      matchesBinding(key({ key: '/', code: 'Digit7', shiftKey: true }), '/'),
    ).toBe(true);
    expect(
      matchesBinding(key({ key: '?', code: 'Minus', shiftKey: true }), '?'),
    ).toBe(true);
  });

  it('requires the exact modifiers otherwise', () => {
    expect(
      matchesBinding(key({ key: 'm', code: 'KeyM', ctrlKey: true }), 'M'),
    ).toBe(false);
    expect(
      matchesBinding(key({ key: '/', code: 'Slash', ctrlKey: true }), '/'),
    ).toBe(false);
  });

  it('does not match an invalid binding', () => {
    expect(matchesBinding(key({ key: 'm' }), '')).toBe(false);
  });
});

describe('bindingFromEvent', () => {
  it('records a combination', () => {
    expect(
      bindingFromEvent(
        key({ key: 'ı', code: 'KeyB', altKey: true, shiftKey: true }),
      ),
    ).toBe('Alt+Shift+B');
  });

  it('records punctuation without shift', () => {
    expect(
      bindingFromEvent(key({ key: '/', code: 'Digit7', shiftKey: true })),
    ).toBe('/');
  });

  it('ignores modifier-only presses', () => {
    expect(bindingFromEvent(key({ key: 'Shift', shiftKey: true }))).toBeNull();
  });
});

describe('resolveBindings', () => {
  it('starts from the defaults', () => {
    const bindings = resolveBindings({});
    for (const action of HOTKEY_ACTIONS) {
      expect(bindings[action.id]).toBe(action.defaultBinding);
    }
  });

  it('applies overrides and disabled entries', () => {
    const bindings = resolveBindings({
      'map.marker': 'shift+m',
      'map.vehicle': null,
    });
    expect(bindings['map.marker']).toBe('Shift+M');
    expect(bindings['map.vehicle']).toBeNull();
  });

  it('drops unknown actions and unparsable bindings', () => {
    const bindings = resolveBindings({
      nonsense: 'X',
      'map.marker': 'Alt+',
    } as Record<string, string>);
    expect(bindings['map.marker']).toBe('M');
    expect('nonsense' in bindings).toBe(false);
  });
});

describe('defaults', () => {
  it('have unique ids and no conflicts', () => {
    const ids = HOTKEY_ACTIONS.map((a) => a.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(findConflicts(resolveBindings({}))).toEqual([]);
  });

  it('use valid bindings', () => {
    for (const action of HOTKEY_ACTIONS) {
      expect(parseBinding(action.defaultBinding)).not.toBeNull();
    }
  });
});

describe('findConflicts', () => {
  it('reports actions sharing a binding', () => {
    const bindings = resolveBindings({ 'map.vehicle': 'M' });
    expect(findConflicts(bindings)).toEqual([
      { binding: 'M', actions: ['map.marker', 'map.vehicle'] },
    ]);
  });
});
