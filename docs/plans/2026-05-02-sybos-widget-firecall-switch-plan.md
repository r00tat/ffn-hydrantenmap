# Sybos-Widget: Einsatz-Wechsel — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Im Sybos-Content-Widget der Chrome-Extension den aktiven Einsatz per Dropdown direkt umschalten können.

**Architecture:** Background-Script liefert die Liste der zugänglichen Einsätze (gefiltert wie Popup `useFirecalls`, `limit(20)`, plus aktiver Einsatz falls außerhalb der Top-20). Content-Script ersetzt das read-only Namensfeld durch ein Vanilla-DOM `<select>`. Auswahl persistiert in `chrome.storage.local.selectedFirecallId` und triggert einen Re-render.

**Tech Stack:** TypeScript, Vanilla DOM, Vitest + jsdom + Testing-Library, Firebase Auth/Firestore (Web SDK im Background), WXT, Chrome Extension MV3.

**Reference Documents:**
- Design: [docs/plans/2026-05-02-sybos-widget-firecall-switch-design.md](2026-05-02-sybos-widget-firecall-switch-design.md)
- Project conventions: [CLAUDE.md](../../CLAUDE.md)

**Project conventions to honor:**
- TDD: failing test first, then implementation.
- Tests **next to** source files, naming `*.test.ts`.
- **Lean style:** Keine Zwischen-Commits/Checks pro Schritt. Genau **ein Commit am Ende**, nachdem alle Final-Checks grün sind.
- Final-Checks (in dieser Reihenfolge, einzeln, nicht `npm run check`):
  - `cd chrome-extension && npx tsc --noEmit`
  - `cd chrome-extension && npx eslint .`
  - `cd chrome-extension && npx vitest run`
  - `cd chrome-extension && npm run build`
- TSC-Fehler **nie** ignorieren.
- Conventional Commits Format.

---

## Task 1: Shared types for firecall list entry

**Files:**
- Modify: `chrome-extension/entrypoints/sybos.content/sybos-firecall.ts` (oder neu shared, siehe unten)
- Reuse: `chrome-extension/src/shared/types.ts` exportiert `Firecall`

Es gibt bereits `Firecall` als shared type. Für die Dropdown-Liste reichen `{ id: string; name?: string; date?: string }` — d.h. `Pick<Firecall, 'id' | 'name' | 'date'>`.

**Action:** Keine neue Datei nötig. In den nächsten Tasks importieren wir den schon existierenden `Firecall`-Type oder verwenden `Pick<Firecall, 'id'|'name'|'date'>`.

Dieser Task ist eine Bestätigung — kein Code-Change.

---

## Task 2: Test for `renderFirecallSelect` (TDD red)

**Files:**
- Create: `chrome-extension/entrypoints/sybos.content/sybos-firecall-select.test.ts`

**Code:**

```ts
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
    // Locale-formatted date — must contain at least the year:
    expect(opt.textContent).toContain('2026');
  });
});
```

---

## Task 3: Implement `renderFirecallSelect` (TDD green)

**Files:**
- Create: `chrome-extension/entrypoints/sybos.content/sybos-firecall-select.ts`

**Code:**

```ts
import { el } from './sybos-widget';

export interface FirecallListEntry {
  id: string;
  name?: string;
  date?: string;
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
  const field = el('div', { className: 'ek-field' });
  field.appendChild(el('label', {}, 'Einsatz'));

  const select = el('select', { className: 'ek-firecall-select' });
  if (firecalls.length === 0) {
    select.disabled = true;
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
    onChange(select.value);
  });

  field.appendChild(select);
  container.appendChild(field);
}
```

---

## Task 4: Add CSS for the select

**Files:**
- Modify: `chrome-extension/entrypoints/sybos.content/sybos.css`

**Append at the end of the file:**

```css
#einsatzkarte-widget .ek-firecall-select {
  width: 100%;
  padding: 4px 6px;
  font-size: 13px;
  border: 1px solid #ccc;
  border-radius: 4px;
  background: white;
  color: #333;
  cursor: pointer;
}

#einsatzkarte-widget .ek-firecall-select:disabled {
  background: #f5f5f5;
  cursor: not-allowed;
}
```

---

## Task 5: Background — `GET_FIRECALL_LIST` handler

**Files:**
- Modify: `chrome-extension/entrypoints/background.ts`

**Step 5.1 — Extend imports**

Replace the firestore import block with:

```ts
import {
  getFirestore,
  doc,
  getDoc,
  collection,
  getDocs,
  query,
  where,
  orderBy,
  limit,
} from 'firebase/firestore';
```

**Step 5.2 — Extend `MessageRequest` union**

Add `| { type: 'GET_FIRECALL_LIST' }` at the end of the union.

**Step 5.3 — Add `getFirecallList` helper**

Insert below `getFirecallVehicles` (around line 99):

```ts
async function getFirecallList(): Promise<{
  firecalls: { id: string; name?: string; date?: string }[];
}> {
  if (!currentUser) return { firecalls: [] };

  // Read claims (groups, firecall) — same source as popup useUserClaims.
  const tokenResult = await currentUser.getIdTokenResult();
  const claims = tokenResult.claims;
  const groups = (claims.groups as string[]) || [];
  const firecallClaim = claims.firecall as string | undefined;

  // Helper to map a firestore doc snapshot to the minimal entry shape.
  const toEntry = (
    id: string,
    data: { name?: string; date?: string; deleted?: boolean },
  ) => ({ id, name: data.name, date: data.date });

  // Single-firecall claim wins (mirrors useFirecalls behavior).
  if (firecallClaim) {
    const snap = await getDoc(doc(firestore, 'call', firecallClaim));
    if (!snap.exists()) return { firecalls: [] };
    const data = snap.data() as {
      name?: string;
      date?: string;
      deleted?: boolean;
    };
    if (data.deleted) return { firecalls: [] };
    return { firecalls: [toEntry(snap.id, data)] };
  }

  if (groups.length === 0) return { firecalls: [] };

  // Firestore 'in' supports max 30 values.
  const queryGroups = groups.slice(0, 30);

  const q = query(
    collection(firestore, 'call'),
    where('deleted', '==', false),
    where('group', 'in', queryGroups),
    orderBy('date', 'desc'),
    limit(20),
  );
  const snapshot = await getDocs(q);
  const list = snapshot.docs.map((d) =>
    toEntry(d.id, d.data() as { name?: string; date?: string }),
  );

  // Ensure the currently-selected firecall is in the list, even if it is
  // older than the top 20.
  const { selectedFirecallId } = await chrome.storage.local.get(
    'selectedFirecallId',
  );
  if (
    selectedFirecallId &&
    !list.some((fc) => fc.id === selectedFirecallId)
  ) {
    try {
      const sel = await getDoc(doc(firestore, 'call', selectedFirecallId));
      if (sel.exists()) {
        const data = sel.data() as {
          name?: string;
          date?: string;
          deleted?: boolean;
        };
        if (!data.deleted) {
          list.push(toEntry(sel.id, data));
          // Re-sort by date descending; missing dates last.
          list.sort((a, b) => {
            if (!a.date) return 1;
            if (!b.date) return -1;
            return a.date < b.date ? 1 : a.date > b.date ? -1 : 0;
          });
        }
      }
    } catch {
      // Permission or other error — ignore, don't break the list.
    }
  }

  return { firecalls: list };
}
```

**Step 5.4 — Wire the handler into the switch**

Add a new case in `handleMessage` (after `GET_FIRECALL_VEHICLES`, before `default`):

```ts
case 'GET_FIRECALL_LIST': {
  await ensureAuthenticated();
  if (!currentUser) return { error: 'Not authenticated' };
  return getFirecallList();
}
```

---

## Task 6: Test for the dropdown wiring in `loadFirecall` (TDD red)

**Files:**
- Create: `chrome-extension/entrypoints/sybos.content/sybos-firecall.test.ts`

**Code:**

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { initWidget } from './sybos-widget';
import { loadFirecall } from './sybos-firecall';

// Minimal chrome API surface used by sybos-firecall + sybos-widget.
type StorageBag = { selectedFirecallId?: string };
type Message =
  | { type: 'GET_AUTH_STATE' }
  | { type: 'GET_CURRENT_FIRECALL' }
  | { type: 'GET_FIRECALL_LIST' };

declare global {
  // eslint-disable-next-line no-var
  var chrome: typeof globalThis.chrome;
}

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
    // Force-rebuild the widget into the test DOM.
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

    // Allow microtasks for the async handler to run.
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
    // Read-only name must still appear.
    expect(document.body.textContent).toContain('Brand');
  });
});
```

Note: The widget `initWidget` polls (`setInterval(... , 200)`) — if the test suite leaves intervals running, vitest may hang. If the existing widget keeps the interval, `vi.useFakeTimers()` plus `vi.useRealTimers()` per test, or wrap the whole describe block in `afterEach(() => vi.clearAllTimers())`. **Verify whether existing tests already deal with this; if not, isolate this test in its own describe.**

---

## Task 7: Wire dropdown into `sybos-firecall.ts` (TDD green)

**Files:**
- Modify: `chrome-extension/entrypoints/sybos.content/sybos-firecall.ts`

**Replace the current contents with:**

```ts
import { el, renderContent, showStatus } from './sybos-widget';
import {
  renderFirecallSelect,
  type FirecallListEntry,
} from './sybos-firecall-select';
import { renderPersonnelSection } from './sybos-section-personnel';
import { renderVehicleTableSection } from './sybos-section-vehicle-table';
import { renderMannschaftEditSection } from './sybos-section-mannschaft-edit';
import { renderVehicleListSection } from './sybos-section-vehicle-list';

const EINSATZKARTE_URL = 'https://einsatz.ffnd.at';

interface Firecall {
  id: string;
  name?: string;
  description?: string;
  date?: string;
}

function showFirecall(
  content: HTMLElement,
  fc: Firecall,
  firecallList: FirecallListEntry[] | null,
): void {
  // Einsatz selector (or fallback to read-only name on list error)
  if (firecallList) {
    renderFirecallSelect(content, firecallList, fc.id, async (newId) => {
      if (newId === fc.id) return;
      await chrome.storage.local.set({ selectedFirecallId: newId });
      await loadFirecall();
    });
  } else {
    const nameField = el('div', { className: 'ek-field' });
    nameField.appendChild(el('label', {}, 'Einsatz'));
    nameField.appendChild(el('strong', {}, fc.name || '–'));
    content.appendChild(nameField);
  }

  // Description (optional)
  if (fc.description) {
    const descField = el('div', { className: 'ek-field' });
    descField.appendChild(el('label', {}, 'Beschreibung'));
    descField.appendChild(document.createTextNode(fc.description));
    content.appendChild(descField);
  }

  // Date
  const dateField = el('div', { className: 'ek-field' });
  dateField.appendChild(el('label', {}, 'Datum'));
  const dateText = fc.date
    ? new Date(fc.date).toLocaleString('de-AT')
    : '–';
  dateField.appendChild(document.createTextNode(dateText));
  content.appendChild(dateField);

  // Link to Einsatzkarte
  const link = el(
    'a',
    {
      className: 'ek-link',
      href: `${EINSATZKARTE_URL}/einsatz/${fc.id}/details`,
      target: '_blank',
      rel: 'noopener noreferrer',
    },
    'In Einsatzkarte öffnen ↗'
  );
  content.appendChild(link);

  // Page-specific sections (each renders only if its SYBOS page is detected)
  renderPersonnelSection(content);
  renderVehicleTableSection(content);
  renderMannschaftEditSection(content);
  renderVehicleListSection(content);
}

/** Load the current firecall + list from the service worker and render. */
export async function loadFirecall(): Promise<void> {
  try {
    const authState = await chrome.runtime.sendMessage({
      type: 'GET_AUTH_STATE',
    });

    if (!authState.isLoggedIn) {
      showStatus('Nicht angemeldet. Bitte über die Extension anmelden.');
      return;
    }

    const [listResp, fcResp] = await Promise.all([
      chrome.runtime
        .sendMessage({ type: 'GET_FIRECALL_LIST' })
        .catch(() => ({ error: 'list-failed' })),
      chrome.runtime.sendMessage({ type: 'GET_CURRENT_FIRECALL' }),
    ]);

    if (fcResp.error) {
      showStatus(fcResp.error);
      return;
    }

    if (!fcResp.firecall) {
      showStatus('Kein aktiver Einsatz');
      return;
    }

    const firecallList: FirecallListEntry[] | null =
      listResp && !listResp.error && Array.isArray(listResp.firecalls)
        ? listResp.firecalls
        : null;

    renderContent((content) =>
      showFirecall(content, fcResp.firecall, firecallList),
    );
  } catch (err) {
    showStatus('Fehler beim Laden');
    console.error('[EK] error loading firecall:', err);
  }
}
```

---

## Task 8: Final verification

Run, in order, from the **chrome-extension** directory. Stop on first failure and fix before moving on.

1. **TypeScript:** `cd chrome-extension && npx tsc --noEmit`
   Expected: no output, exit 0.

2. **ESLint:** `cd chrome-extension && npx eslint .`
   Expected: no errors, no warnings.

3. **Tests:** `cd chrome-extension && npx vitest run`
   Expected: all suites pass, including the two new ones.

4. **Build:** `cd chrome-extension && npm run build`
   Expected: WXT builds the extension without errors.

5. **Manual smoke test (recommended, ask user):**
   - Reload the unpacked extension in Chrome.
   - Open `https://sybos.lfv-bgld.at/...`, click `EK` toggle.
   - Dropdown shows ≥1 Einsatz, current one preselected.
   - Pick a different Einsatz → panel reloads with the new data.
   - Open the extension popup → reflects the new selection.

---

## Task 9: Commit

Single commit at the end (project convention: lean plan, no per-step commits).

```bash
git add chrome-extension/entrypoints/sybos.content/sybos-firecall-select.ts \
        chrome-extension/entrypoints/sybos.content/sybos-firecall-select.test.ts \
        chrome-extension/entrypoints/sybos.content/sybos-firecall.ts \
        chrome-extension/entrypoints/sybos.content/sybos-firecall.test.ts \
        chrome-extension/entrypoints/sybos.content/sybos.css \
        chrome-extension/entrypoints/background.ts
git checkout -- next-env.d.ts 2>/dev/null || true
git commit -m "feat(chrome-extension): switch firecall directly from sybos widget"
```

---

## Notes & Risks

- **No new shared types** — reuses existing `Firecall` shape.
- **Permissions:** `chrome.storage` already in manifest (used by popup). No new manifest entries.
- **Auth:** Background uses already-cached `currentUser`; `getIdTokenResult()` is safe (auto-refreshes).
- **Test isolation:** `sybos-widget.initWidget` starts a 200 ms `setInterval`. If the new test file leaves it running it may keep vitest alive. If `vitest run` hangs after Task 6, switch to fake timers in the affected describe block (`vi.useFakeTimers()`/`vi.useRealTimers()`).
- **Sybos DOM rewrites:** Widget already self-heals. Auswahl-Wechsel triggert `loadFirecall`, was nach DOM-Rewrite bereits funktioniert (siehe `sybos-widget.ts:129`).
- **Visual ordering merge:** Wenn der aktive Einsatz älter als die Top-20 ist und reingemerged wird, erscheint er an seiner Datums-Position (kein Sonderplatz). Das ist beabsichtigt.
