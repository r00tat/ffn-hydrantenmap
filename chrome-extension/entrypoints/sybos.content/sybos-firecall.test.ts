import { describe, it, expect, vi, beforeEach } from 'vitest';
import { initWidget } from './sybos-widget';
import { loadFirecall } from './sybos-firecall';

// Minimal chrome API surface used by sybos-firecall + sybos-widget.
type StorageBag = { selectedFirecallId?: string };
type Message =
  | { type: 'GET_AUTH_STATE' }
  | { type: 'GET_CURRENT_FIRECALL' }
  | { type: 'GET_FIRECALL_LIST' };

/** The SYBOS Einsatz detail form, as PAT renders it (label cell + control). */
function appendSybosEinsatzForm(fields: [string, string][]): void {
  const form = document.createElement('form');
  form.setAttribute('name', 'frmEinsatzAdd');
  const table = document.createElement('table');
  for (const [label, value] of fields) {
    const row = document.createElement('tr');
    const labelCell = document.createElement('td');
    labelCell.textContent = label;
    const valueCell = document.createElement('td');
    const input = document.createElement('input');
    input.name = label;
    input.value = value;
    valueCell.appendChild(input);
    row.append(labelCell, valueCell);
    table.appendChild(row);
  }
  form.appendChild(table);
  document.body.appendChild(form);
}

const KAMINBRAND = {
  id: 'a',
  name: 'B1 Kaminbrand Hauptstraße 12',
  date: new Date(2026, 4, 2, 10, 12).toISOString(),
};

const OELSPUR = {
  id: 'b',
  name: 'T1 Ölspur Seestraße',
  date: new Date(2026, 3, 24, 8, 0).toISOString(),
};

function setupChromeMock(opts: {
  authed?: boolean;
  firecallList?: { id: string; name?: string; date?: string }[];
  currentFirecall?: { id: string; name?: string; date?: string } | null;
  storage?: StorageBag;
  onSet?: (bag: StorageBag) => void;
}) {
  const storage: StorageBag = opts.storage ?? { selectedFirecallId: 'a' };

  const sendMessage = vi.fn(async (msg: Message) => {
    if (msg.type === 'GET_AUTH_STATE') {
      return { isLoggedIn: opts.authed ?? true };
    }
    if (msg.type === 'GET_FIRECALL_LIST') {
      return { firecalls: opts.firecallList ?? [] };
    }
    if (msg.type === 'GET_CURRENT_FIRECALL') {
      return opts.currentFirecall === null
        ? { firecall: null }
        : { firecall: opts.currentFirecall ?? { id: 'a', name: 'Brand' } };
    }
    return {};
  });

  globalThis.chrome = {
    runtime: { sendMessage },
    storage: {
      local: {
        get: vi.fn(async (_key: string) => storage),
        set: vi.fn(async (bag: StorageBag) => {
          Object.assign(storage, bag);
          opts.onSet?.(storage);
        }),
      },
    },
  } as unknown as typeof chrome;

  return { sendMessage, storage };
}

describe('loadFirecall', () => {
  beforeEach(() => {
    document.body.replaceChildren();
    // initWidget defers via setTimeout when body is empty (its DOM-rewrite
    // self-heal heuristic). Seed a placeholder so the widget builds
    // synchronously and module-level `content` is wired up.
    document.body.appendChild(document.createElement('div'));
    initWidget(() => {});
  });

  it('renders a <select> populated with the firecall list', async () => {
    setupChromeMock({
      firecallList: [
        { id: 'a', name: 'Brand', date: '2026-05-02T10:00:00Z' },
        { id: 'b', name: 'Übung', date: '2026-04-15T08:00:00Z' },
      ],
      currentFirecall: { id: 'a', name: 'Brand', date: '2026-05-02T10:00:00Z' },
    });

    await loadFirecall();

    const select = document.querySelector(
      '.ek-firecall-select',
    ) as HTMLSelectElement | null;
    expect(select).not.toBeNull();
    expect(select!.options.length).toBe(2);
    expect(select!.value).toBe('a');
  });

  it('persists selection to chrome.storage.local on change', async () => {
    const { storage } = setupChromeMock({
      firecallList: [
        { id: 'a', name: 'Brand', date: '2026-05-02T10:00:00Z' },
        { id: 'b', name: 'Übung', date: '2026-04-15T08:00:00Z' },
      ],
      currentFirecall: { id: 'a', name: 'Brand' },
    });

    await loadFirecall();

    const select = document.querySelector(
      '.ek-firecall-select',
    ) as HTMLSelectElement;
    select.value = 'b';
    select.dispatchEvent(new Event('change', { bubbles: true }));

    await new Promise((r) => setTimeout(r, 0));
    await new Promise((r) => setTimeout(r, 0));

    expect(storage.selectedFirecallId).toBe('b');
  });

  it('falls back to the read-only name when GET_FIRECALL_LIST fails', async () => {
    const sendMessage = vi.fn(async (msg: Message) => {
      if (msg.type === 'GET_AUTH_STATE') return { isLoggedIn: true };
      if (msg.type === 'GET_FIRECALL_LIST') {
        throw new Error('boom');
      }
      if (msg.type === 'GET_CURRENT_FIRECALL') {
        return { firecall: { id: 'a', name: 'Brand', date: '2026-05-02T10:00:00Z' } };
      }
      return {};
    });

    globalThis.chrome = {
      runtime: { sendMessage },
      storage: {
        local: {
          get: vi.fn(async () => ({ selectedFirecallId: 'a' })),
          set: vi.fn(),
        },
      },
    } as unknown as typeof chrome;

    await loadFirecall();

    expect(document.querySelector('.ek-firecall-select')).toBeNull();
    expect(document.body.textContent).toContain('Brand');
  });

  it('warns and switches when the SYBOS page shows a different einsatz', async () => {
    appendSybosEinsatzForm([
      ['Datum', '02.05.2026'],
      ['Beginn', '10:15'],
      ['Einsatzstichwort', 'B1 Kaminbrand'],
    ]);
    const { storage } = setupChromeMock({
      firecallList: [KAMINBRAND, OELSPUR],
      currentFirecall: OELSPUR,
      storage: { selectedFirecallId: 'b' },
    });

    await loadFirecall();

    const warning = document.querySelector('.ek-match-warning');
    expect(warning).not.toBeNull();
    expect(warning!.textContent).toContain('Datum/Uhrzeit');
    expect(warning!.textContent).toContain('B1 Kaminbrand Hauptstraße 12');

    (warning!.querySelector('button') as HTMLButtonElement).click();
    await new Promise((r) => setTimeout(r, 0));
    await new Promise((r) => setTimeout(r, 0));

    expect(storage.selectedFirecallId).toBe('a');
  });

  it('confirms the selection when it fits the SYBOS einsatz', async () => {
    appendSybosEinsatzForm([
      ['Datum', '02.05.2026'],
      ['Beginn', '10:15'],
      ['Einsatzstichwort', 'B1 Kaminbrand'],
    ]);
    setupChromeMock({
      firecallList: [KAMINBRAND, OELSPUR],
      currentFirecall: KAMINBRAND,
    });

    await loadFirecall();

    expect(document.querySelector('.ek-match-warning')).toBeNull();
    expect(document.querySelector('.ek-match')).not.toBeNull();
  });

  it('says nothing on a page without SYBOS einsatz data', async () => {
    setupChromeMock({
      firecallList: [KAMINBRAND, OELSPUR],
      currentFirecall: OELSPUR,
      storage: { selectedFirecallId: 'b' },
    });

    await loadFirecall();

    expect(document.querySelector('.ek-match')).toBeNull();
  });

  it('offers the matching einsatz when none is selected yet', async () => {
    appendSybosEinsatzForm([
      ['Datum', '02.05.2026'],
      ['Beginn', '10:15'],
      ['Einsatzstichwort', 'B1 Kaminbrand'],
    ]);
    const { storage } = setupChromeMock({
      firecallList: [KAMINBRAND, OELSPUR],
      currentFirecall: null,
      storage: {},
    });

    await loadFirecall();

    expect(document.querySelector('.ek-firecall-select')).not.toBeNull();
    const warning = document.querySelector('.ek-match-warning');
    expect(warning).not.toBeNull();

    (warning!.querySelector('button') as HTMLButtonElement).click();
    await new Promise((r) => setTimeout(r, 0));
    await new Promise((r) => setTimeout(r, 0));

    expect(storage.selectedFirecallId).toBe('a');
  });
});
