import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderFirecallMatchSection } from './sybos-section-firecall-match';
import type { FirecallMatch } from './firecall-matching';

const kaminbrand = {
  id: 'a',
  name: 'B1 Kaminbrand Hauptstraße 12',
  date: '2026-05-02T08:15:00.000Z',
};

function match(
  firecall: { id: string; name?: string; date?: string },
  score: number,
): FirecallMatch {
  return { firecall, score, factors: [], mismatches: [] };
}

describe('renderFirecallMatchSection', () => {
  let container: HTMLElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.replaceChildren(container);
  });

  it('renders nothing without a usable SYBOS context', () => {
    renderFirecallMatchSection(
      container,
      { verdict: 'unknown', best: null, selected: null },
      () => {},
    );
    expect(container.children.length).toBe(0);
  });

  it('renders nothing when the selection is merely plausible', () => {
    renderFirecallMatchSection(
      container,
      { verdict: 'ok', best: match(kaminbrand, 0.5), selected: match(kaminbrand, 0.5) },
      () => {},
    );
    expect(container.children.length).toBe(0);
  });

  it('confirms a matching selection', () => {
    renderFirecallMatchSection(
      container,
      {
        verdict: 'confirmed',
        best: match(kaminbrand, 0.9),
        selected: match(kaminbrand, 0.9),
      },
      () => {},
    );
    expect(container.textContent).toContain('SYBOS-Einsatz');
    expect(container.querySelector('.ek-match-warning')).toBeNull();
    expect(container.querySelector('button')).toBeNull();
  });

  it('warns with reasons and offers the better firecall', () => {
    const onSwitch = vi.fn();
    const selected = {
      firecall: { id: 'b', name: 'T1 Ölspur', date: '2026-04-24T06:00:00.000Z' },
      score: 0.1,
      factors: [],
      mismatches: [
        {
          key: 'date' as const,
          label: 'Datum/Uhrzeit',
          score: 0,
          weight: 4,
          detail: 'SYBOS 02.05.2026 · Einsatz 24.04.2026',
        },
      ],
    };

    renderFirecallMatchSection(
      container,
      { verdict: 'switch', best: match(kaminbrand, 0.95), selected },
      onSwitch,
    );

    const warning = container.querySelector('.ek-match-warning');
    expect(warning).not.toBeNull();
    expect(container.textContent).toContain('Datum/Uhrzeit');
    expect(container.textContent).toContain('SYBOS 02.05.2026 · Einsatz 24.04.2026');
    expect(container.textContent).toContain('B1 Kaminbrand Hauptstraße 12');

    const button = container.querySelector('button') as HTMLButtonElement;
    expect(button.textContent).toContain('wechseln');
    button.click();
    expect(onSwitch).toHaveBeenCalledWith('a');
  });

  it('offers the match as a first selection when nothing is selected', () => {
    const onSwitch = vi.fn();
    renderFirecallMatchSection(
      container,
      { verdict: 'switch', best: match(kaminbrand, 0.95), selected: null },
      onSwitch,
    );
    expect(container.textContent).toContain('B1 Kaminbrand Hauptstraße 12');
    const button = container.querySelector('button') as HTMLButtonElement;
    button.click();
    expect(onSwitch).toHaveBeenCalledWith('a');
  });

  it('hints without warning when no einsatz can be assigned', () => {
    renderFirecallMatchSection(
      container,
      { verdict: 'unclear', best: match(kaminbrand, 0.2), selected: match(kaminbrand, 0.2) },
      () => {},
    );
    expect(container.querySelector('.ek-match-warning')).toBeNull();
    expect(container.textContent).toContain('Keine Zuordnung');
    expect(container.querySelector('button')).toBeNull();
  });
});
