import { el } from './sybos-widget';

export interface FirecallListEntry {
  id: string;
  name?: string;
  date?: string;
  description?: string;
}

/**
 * Render a labeled <select> with the given firecalls. Replaces the read-only
 * Einsatz field in the panel — when the user picks a different option,
 * onChange is called with the new firecall id.
 */
export function renderFirecallSelect(
  container: HTMLElement,
  firecalls: FirecallListEntry[],
  selectedId: string | null,
  onChange: (id: string) => void,
): void {
  const selectId = `ek-firecall-select-${crypto.randomUUID()}`;
  const field = el('div', { className: 'ek-field' });
  field.appendChild(el('label', { for: selectId }, 'Einsatz'));

  const select = el('select', { className: 'ek-firecall-select', id: selectId });
  if (firecalls.length === 0) {
    select.disabled = true;
  }

  // Without a (still existing) selection the browser would show the first
  // entry as if it were chosen — a lie the user then transfers crew into.
  const hasSelection = firecalls.some((fc) => fc.id === selectedId);
  if (firecalls.length > 0 && !hasSelection) {
    const placeholder = el('option', { value: '' }, '– Einsatz wählen –');
    placeholder.selected = true;
    select.appendChild(placeholder);
  }

  for (const fc of firecalls) {
    const dateText = fc.date
      ? new Date(fc.date).toLocaleDateString('de-AT')
      : '–';
    const labelText = `${fc.name || '–'} — ${dateText}`;
    const opt = el('option', { value: fc.id }, labelText);
    if (fc.id === selectedId) {
      opt.selected = true;
    }
    select.appendChild(opt);
  }

  select.addEventListener('change', () => {
    if (!select.value) return;
    onChange(select.value);
  });

  field.appendChild(select);
  container.appendChild(field);
}
