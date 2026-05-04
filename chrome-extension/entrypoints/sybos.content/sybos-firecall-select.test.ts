import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderFirecallSelect } from './sybos-firecall-select';

interface FirecallEntry {
  id: string;
  name?: string;
  date?: string;
}

describe('renderFirecallSelect', () => {
  let container: HTMLElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  it('renders a label "Einsatz" and a <select>', () => {
    renderFirecallSelect(container, [], null, () => {});
    expect(container.querySelector('label')?.textContent).toBe('Einsatz');
    expect(container.querySelector('select')).not.toBeNull();
  });

  it('renders one option per firecall in the order received', () => {
    const fcs: FirecallEntry[] = [
      { id: 'a', name: 'Brand', date: '2026-05-02T10:00:00Z' },
      { id: 'b', name: 'Übung', date: '2026-04-15T08:00:00Z' },
    ];
    renderFirecallSelect(container, fcs, 'a', () => {});
    const opts = container.querySelectorAll('option');
    expect(opts.length).toBe(2);
    expect(opts[0].value).toBe('a');
    expect(opts[1].value).toBe('b');
  });

  it('marks the option matching selectedId as selected', () => {
    const fcs: FirecallEntry[] = [
      { id: 'a', name: 'Brand', date: '2026-05-02T10:00:00Z' },
      { id: 'b', name: 'Übung', date: '2026-04-15T08:00:00Z' },
    ];
    renderFirecallSelect(container, fcs, 'b', () => {});
    const select = container.querySelector('select') as HTMLSelectElement;
    expect(select.value).toBe('b');
  });

  it('disables the select when the list is empty', () => {
    renderFirecallSelect(container, [], null, () => {});
    const select = container.querySelector('select') as HTMLSelectElement;
    expect(select.disabled).toBe(true);
  });

  it('calls onChange with the new id when selection changes', () => {
    const fcs: FirecallEntry[] = [
      { id: 'a', name: 'Brand', date: '2026-05-02T10:00:00Z' },
      { id: 'b', name: 'Übung', date: '2026-04-15T08:00:00Z' },
    ];
    const onChange = vi.fn();
    renderFirecallSelect(container, fcs, 'a', onChange);
    const select = container.querySelector('select') as HTMLSelectElement;
    select.value = 'b';
    select.dispatchEvent(new Event('change', { bubbles: true }));
    expect(onChange).toHaveBeenCalledWith('b');
  });

  it('shows the firecall name and a localized date in each option label', () => {
    const fcs: FirecallEntry[] = [
      { id: 'a', name: 'Brand', date: '2026-05-02T10:00:00Z' },
    ];
    renderFirecallSelect(container, fcs, 'a', () => {});
    const opt = container.querySelector('option') as HTMLOptionElement;
    expect(opt.textContent).toContain('Brand');
    expect(opt.textContent).toContain('2026');
  });
});
