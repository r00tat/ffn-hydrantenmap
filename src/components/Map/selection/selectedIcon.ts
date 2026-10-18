import L from 'leaflet';

/** CSS-Klasse am Marker-Element eines ausgewählten Elements (globals.css). */
export const SELECTED_MARKER_CLASS = 'firecall-item-multiselected';

/**
 * Dasselbe Icon mit der Auswahl-Klasse.
 *
 * Über ein neues Icon und nicht über `classList` am Element: react-leaflet
 * ersetzt das Element bei jedem `setIcon`, eine von Hand gesetzte Klasse ginge
 * dabei verloren. Die Optionen werden per `for…in` kopiert, weil Leaflet sie
 * über die Prototypkette erbt (`L.Icon.Default`) und ein Spread nur eigene
 * Felder nimmt.
 */
export function withSelectedClass<T extends L.Icon | L.DivIcon>(icon: T): T {
  const options: Record<string, unknown> = {};
  for (const key in icon.options) {
    options[key] = (icon.options as Record<string, unknown>)[key];
  }
  const className = [options.className, SELECTED_MARKER_CLASS]
    .filter(Boolean)
    .join(' ');
  const Ctor = icon.constructor as new (opts: Record<string, unknown>) => T;
  return new Ctor({ ...options, className });
}
