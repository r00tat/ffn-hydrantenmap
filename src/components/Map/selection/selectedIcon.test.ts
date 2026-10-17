// @vitest-environment jsdom
import L from 'leaflet';
import { describe, expect, it } from 'vitest';
import { SELECTED_MARKER_CLASS, withSelectedClass } from './selectedIcon';

describe('withSelectedClass', () => {
  it('hängt die Klasse an und behält die übrigen Optionen', () => {
    const icon = L.icon({
      iconUrl: '/icons/marker.svg',
      iconSize: [24, 24],
      className: 'eigene',
    });
    const selected = withSelectedClass(icon);
    expect(selected).toBeInstanceOf(L.Icon);
    expect(selected.options.className).toBe(`eigene ${SELECTED_MARKER_CLASS}`);
    expect(selected.options.iconUrl).toBe('/icons/marker.svg');
    expect(selected.options.iconSize).toEqual([24, 24]);
  });

  it('funktioniert mit DivIcons', () => {
    const selected = withSelectedClass(L.divIcon({ html: '<b>x</b>' }));
    expect(selected).toBeInstanceOf(L.DivIcon);
    expect(selected.options.className).toContain(SELECTED_MARKER_CLASS);
    expect(selected.options.html).toBe('<b>x</b>');
  });

  it('übernimmt geerbte Optionen von L.Icon.Default', () => {
    const selected = withSelectedClass(new L.Icon.Default());
    expect(selected.options.iconSize).toEqual([25, 41]);
    expect(selected.options.className).toContain(SELECTED_MARKER_CLASS);
  });
});
