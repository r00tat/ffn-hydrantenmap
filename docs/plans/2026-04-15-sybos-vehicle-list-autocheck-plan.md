# SYBOS-Fahrzeugliste Auto-Check — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Chrome-Extension zeigt auf der SYBOS-Fahrzeug-Auswahlseite einen Button, der alle Fahrzeug-Checkboxen anhakt, deren Fahrzeug (Name / Rufname) auf ein `FirecallItem` mit `type: 'vehicle'` aus dem aktiven Einsatz matcht.

**Architecture:** Neuer DOM-Parser für die ExtJS-Fahrzeugtabelle, neue Matching-Funktion (WAname dann WArufname, case-insensitive, exact), neuer Service-Worker Message-Typ `GET_FIRECALL_VEHICLES`, neuer UI-Abschnitt im bestehenden Widget. Personal-Parser wird so abgesichert, dass er `{GEbez}`-Platzhalter-Zeilen ignoriert (sonst falsch-positiv auf der Fahrzeugseite).

**Tech Stack:** TypeScript, Vite, Vitest (jsdom), Chrome Extension MV3, Firebase Web SDK (im Service Worker), Firestore collection `call/{id}/item`.

**Design-Doc:** `docs/plans/2026-04-15-sybos-vehicle-list-autocheck-design.md`

**Working directory:** `chrome-extension/` (alle Befehle relativ dazu, sofern nicht anders angegeben)

---

## Task 1: Personal-Parser gegen `{GEbez}`-Platzhalter absichern

**Motivation:** Die neue Fahrzeugseite enthält denselben `name_tbl[deleted[ID]]`-Selektor, aber mit dem Template-Wert `{GEbez}`. Ohne Filter würde `hasSybosPersonTable()` und damit die Personal-Sektion im Widget auch auf der Fahrzeugseite erscheinen.

**Files:**
- Modify: `chrome-extension/src/content/sybos-table.ts`
- Test: `chrome-extension/src/content/sybos-table.test.ts`

**Step 1: Failing Test — `parseSybosPersonTable` überspringt `{GEbez}`**

Add after the existing `parseSybosPersonTable` describe block, inside it, this test:

```ts
it('skips rows with {GEbez} template placeholder value', () => {
  addPersonRow(document.body, '1406', 'Mustermann Jörg');
  addPersonRow(document.body, '2006', '{GEbez}');
  addPersonRow(document.body, '1407', 'Müller Franz');

  const result = parseSybosPersonTable();
  expect(result).toHaveLength(2);
  expect(result.map((p) => p.id)).toEqual(['1406', '1407']);
});
```

And in the `hasSybosPersonTable` describe block:

```ts
it('returns false when table contains only {GEbez} rows', () => {
  addPersonRow(document.body, '2006', '{GEbez}');
  addPersonRow(document.body, '2007', '{GEbez}');
  expect(hasSybosPersonTable()).toBe(false);
});
```

**Step 2: Run tests to verify they fail**

```bash
npx vitest run src/content/sybos-table.test.ts
```

Expected: FAIL — 2006 row would be parsed with name `{GEbez}`; `hasSybosPersonTable` returns true.

**Step 3: Implement the filter**

In `sybos-table.ts`, change `parseSybosPersonTable` to skip `{GEbez}` rows:

```ts
for (const nameInput of nameInputs) {
  const name = nameInput.value;
  if (name === '{GEbez}') continue;   // vehicle-list placeholder, not a person
  // ... existing code
}
```

And change `hasSybosPersonTable` to use the parsed result:

```ts
export function hasSybosPersonTable(): boolean {
  return parseSybosPersonTable().length > 0;
}
```

**Step 4: Run tests to verify they pass**

```bash
npx vitest run src/content/sybos-table.test.ts
```

Expected: PASS (all 4 tests).

**Step 5: Commit**

```bash
git add chrome-extension/src/content/sybos-table.ts chrome-extension/src/content/sybos-table.test.ts
git commit -m "fix(chrome-extension): ignore {GEbez} placeholder rows in SYBOS person table parser"
```

---

## Task 2: Parser für die SYBOS-Fahrzeugliste (`sybos-vehicle-list.ts`)

**Files:**
- Create: `chrome-extension/src/content/sybos-vehicle-list.ts`
- Create: `chrome-extension/src/content/sybos-vehicle-list.test.ts`

**Step 1: Write the failing test**

Full file `chrome-extension/src/content/sybos-vehicle-list.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import {
  parseSybosVehicleList,
  hasSybosVehicleList,
} from './sybos-vehicle-list';

function addVehicleRow(
  container: HTMLElement,
  id: string,
  waname: string,
  warufname: string
) {
  const tr = document.createElement('tr');

  // Checkbox cell
  const tdCheck = document.createElement('td');
  const divCheck = document.createElement('div');
  divCheck.className = 'x-grid3-cell-inner x-grid3-col-deleted';
  const hiddenBList = document.createElement('input');
  hiddenBList.type = 'hidden';
  hiddenBList.name = 'BListMulti[]';
  hiddenBList.value = id;
  divCheck.appendChild(hiddenBList);
  const checkbox = document.createElement('input');
  checkbox.type = 'checkbox';
  checkbox.name = `deleted[${id}]`;
  checkbox.value = id;
  divCheck.appendChild(checkbox);
  const hiddenNameTbl = document.createElement('input');
  hiddenNameTbl.type = 'hidden';
  hiddenNameTbl.name = `name_tbl[deleted[${id}]]`;
  hiddenNameTbl.value = '{GEbez}';
  divCheck.appendChild(hiddenNameTbl);
  tdCheck.appendChild(divCheck);
  tr.appendChild(tdCheck);

  // WAname cell
  const tdWAname = document.createElement('td');
  const divWAname = document.createElement('div');
  divWAname.className = 'x-grid3-cell-inner x-grid3-col-WAname';
  divWAname.textContent = waname;
  tdWAname.appendChild(divWAname);
  tr.appendChild(tdWAname);

  // WArufname cell
  const tdRuf = document.createElement('td');
  const divRuf = document.createElement('div');
  divRuf.className = 'x-grid3-cell-inner x-grid3-col-WArufname';
  divRuf.textContent = warufname;
  tdRuf.appendChild(divRuf);
  tr.appendChild(tdRuf);

  container.appendChild(tr);
}

describe('parseSybosVehicleList', () => {
  beforeEach(() => {
    document.body.replaceChildren();
  });

  it('extracts rows with id, waname, warufname and checkbox', () => {
    const table = document.createElement('table');
    const tbody = document.createElement('tbody');
    table.appendChild(tbody);
    document.body.appendChild(table);
    addVehicleRow(tbody, '2006', 'SRF', 'Rüst Neusiedl am See');
    addVehicleRow(tbody, '46143', 'RLFA 3000/100', 'RüstLösch Neusiedl am See');

    const rows = parseSybosVehicleList();
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      id: '2006',
      waname: 'SRF',
      warufname: 'Rüst Neusiedl am See',
    });
    expect(rows[0].checkbox).toBeInstanceOf(HTMLInputElement);
    expect(rows[1].waname).toBe('RLFA 3000/100');
  });

  it('treats non-breaking-space WArufname as empty', () => {
    const table = document.createElement('table');
    const tbody = document.createElement('tbody');
    table.appendChild(tbody);
    document.body.appendChild(table);
    addVehicleRow(tbody, '3028', 'ATS Einachsanhänger', '\u00a0');

    const rows = parseSybosVehicleList();
    expect(rows).toHaveLength(1);
    expect(rows[0].warufname).toBe('');
  });

  it('returns empty array when no vehicle rows are present', () => {
    document.body.appendChild(document.createElement('div'));
    expect(parseSybosVehicleList()).toEqual([]);
  });

  it('skips rows without a WAname column', () => {
    const table = document.createElement('table');
    const tbody = document.createElement('tbody');
    table.appendChild(tbody);
    document.body.appendChild(table);

    const tr = document.createElement('tr');
    const td = document.createElement('td');
    const div = document.createElement('div');
    div.className = 'x-grid3-col-deleted';
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.name = 'deleted[999]';
    div.appendChild(cb);
    td.appendChild(div);
    tr.appendChild(td);
    tbody.appendChild(tr);

    expect(parseSybosVehicleList()).toEqual([]);
  });
});

describe('hasSybosVehicleList', () => {
  beforeEach(() => {
    document.body.replaceChildren();
  });

  it('returns true when at least one WAname column is present', () => {
    const div = document.createElement('div');
    div.className = 'x-grid3-col-WAname';
    div.textContent = 'SRF';
    document.body.appendChild(div);
    expect(hasSybosVehicleList()).toBe(true);
  });

  it('returns false when no WAname column exists', () => {
    document.body.appendChild(document.createElement('span'));
    expect(hasSybosVehicleList()).toBe(false);
  });
});
```

**Step 2: Run tests to verify they fail**

```bash
npx vitest run src/content/sybos-vehicle-list.test.ts
```

Expected: FAIL — module not found.

**Step 3: Implement the parser**

Create `chrome-extension/src/content/sybos-vehicle-list.ts`:

```ts
export interface SybosVehicleListRow {
  id: string;
  waname: string;
  warufname: string;
  checkbox: HTMLInputElement;
}

/**
 * Collapse whitespace (including non-breaking space) and trim.
 */
function normalizeCellText(value: string | null | undefined): string {
  if (!value) return '';
  return value.replace(/\u00a0/g, ' ').trim();
}

/**
 * Parse the SYBOS vehicle-list table (ExtJS x-grid3) from the current DOM.
 * Each row is identified by a `.x-grid3-col-WAname` cell and a sibling
 * checkbox `input[name^="deleted["]`.
 */
export function parseSybosVehicleList(): SybosVehicleListRow[] {
  const wanameCells = document.querySelectorAll<HTMLElement>(
    '.x-grid3-col-WAname'
  );

  const rows: SybosVehicleListRow[] = [];

  for (const wanameCell of wanameCells) {
    const tr = wanameCell.closest('tr');
    if (!tr) continue;

    const checkbox = tr.querySelector<HTMLInputElement>(
      'input[type="checkbox"][name^="deleted["]'
    );
    if (!checkbox) continue;

    const match = checkbox.name.match(/^deleted\[(\d+)\]$/);
    if (!match) continue;

    const id = match[1];
    const waname = normalizeCellText(wanameCell.textContent);
    if (!waname) continue;

    const warufnameCell = tr.querySelector<HTMLElement>(
      '.x-grid3-col-WArufname'
    );
    const warufname = normalizeCellText(warufnameCell?.textContent);

    rows.push({ id, waname, warufname, checkbox });
  }

  return rows;
}

/**
 * Check whether the current page contains a SYBOS vehicle-list table.
 */
export function hasSybosVehicleList(): boolean {
  return document.querySelector('.x-grid3-col-WAname') !== null;
}
```

**Step 4: Run tests to verify they pass**

```bash
npx vitest run src/content/sybos-vehicle-list.test.ts
```

Expected: PASS (6 tests).

**Step 5: Commit**

```bash
git add chrome-extension/src/content/sybos-vehicle-list.ts chrome-extension/src/content/sybos-vehicle-list.test.ts
git commit -m "feat(chrome-extension): parse SYBOS vehicle-list table rows"
```

---

## Task 3: Matching-Funktion `findMatchingVehicleListRow`

**Files:**
- Create: `chrome-extension/src/content/vehicle-list-matching.ts`
- Create: `chrome-extension/src/content/vehicle-list-matching.test.ts`

**Step 1: Write the failing test**

Full file `chrome-extension/src/content/vehicle-list-matching.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { findMatchingVehicleListRow } from './vehicle-list-matching';
import type { SybosVehicleListRow } from './sybos-vehicle-list';

function row(
  id: string,
  waname: string,
  warufname: string
): SybosVehicleListRow {
  return {
    id,
    waname,
    warufname,
    checkbox: document.createElement('input'),
  };
}

describe('findMatchingVehicleListRow', () => {
  const rows: SybosVehicleListRow[] = [
    row('2006', 'SRF', 'Rüst Neusiedl am See'),
    row('46143', 'RLFA 3000/100', 'RüstLösch Neusiedl am See'),
    row('2004', 'TLFA 4000', 'Tank1 Neusiedl am See'),
    row('61254', 'MTFA', 'MTF Neusiedl am See'),
  ];

  it('matches WAname exactly', () => {
    expect(findMatchingVehicleListRow('SRF', rows)).toBe(rows[0]);
  });

  it('matches WArufname when WAname does not match', () => {
    expect(findMatchingVehicleListRow('Tank1 Neusiedl am See', rows)).toBe(
      rows[2]
    );
  });

  it('prefers WAname over WArufname when both could match different rows', () => {
    const mixed: SybosVehicleListRow[] = [
      row('1', 'MTF Neusiedl am See', 'Kommando'),
      row('2', 'MTFA', 'MTF Neusiedl am See'),
    ];
    expect(findMatchingVehicleListRow('MTF Neusiedl am See', mixed)).toBe(
      mixed[0]
    );
  });

  it('is case-insensitive', () => {
    expect(findMatchingVehicleListRow('srf', rows)).toBe(rows[0]);
    expect(findMatchingVehicleListRow('TANK1 NEUSIEDL AM SEE', rows)).toBe(
      rows[2]
    );
  });

  it('tolerates surrounding whitespace on input', () => {
    expect(findMatchingVehicleListRow('  SRF  ', rows)).toBe(rows[0]);
  });

  it('returns null when nothing matches', () => {
    expect(findMatchingVehicleListRow('XYZ', rows)).toBeNull();
  });

  it('returns null for empty input', () => {
    expect(findMatchingVehicleListRow('', rows)).toBeNull();
    expect(findMatchingVehicleListRow('   ', rows)).toBeNull();
  });

  it('ignores empty warufname during matching', () => {
    const sparse: SybosVehicleListRow[] = [row('1', 'Hubstapler', '')];
    expect(findMatchingVehicleListRow('', sparse)).toBeNull();
    expect(findMatchingVehicleListRow('Hubstapler', sparse)).toBe(sparse[0]);
  });

  it('returns null when rows are empty', () => {
    expect(findMatchingVehicleListRow('SRF', [])).toBeNull();
  });
});
```

**Step 2: Run tests to verify they fail**

```bash
npx vitest run src/content/vehicle-list-matching.test.ts
```

Expected: FAIL — module not found.

**Step 3: Implement the matcher**

Create `chrome-extension/src/content/vehicle-list-matching.ts`:

```ts
import type { SybosVehicleListRow } from './sybos-vehicle-list';

/**
 * Find a SYBOS vehicle-list row matching `ekName`. Matching rules:
 *   1. WAname exact (case-insensitive, trimmed) — first hit wins.
 *   2. Else WArufname exact (case-insensitive, trimmed).
 *   3. Else null.
 * Empty input always returns null; rows with empty WArufname never
 * match an empty-string candidate.
 */
export function findMatchingVehicleListRow(
  ekName: string,
  rows: SybosVehicleListRow[]
): SybosVehicleListRow | null {
  const normalized = ekName.trim().toLowerCase();
  if (!normalized) return null;

  for (const row of rows) {
    if (row.waname.trim().toLowerCase() === normalized) {
      return row;
    }
  }

  for (const row of rows) {
    const ruf = row.warufname.trim().toLowerCase();
    if (ruf && ruf === normalized) {
      return row;
    }
  }

  return null;
}
```

**Step 4: Run tests to verify they pass**

```bash
npx vitest run src/content/vehicle-list-matching.test.ts
```

Expected: PASS (9 tests).

**Step 5: Commit**

```bash
git add chrome-extension/src/content/vehicle-list-matching.ts chrome-extension/src/content/vehicle-list-matching.test.ts
git commit -m "feat(chrome-extension): add vehicle-list matching by WAname then WArufname"
```

---

## Task 4: Service-Worker Message `GET_FIRECALL_VEHICLES`

**Files:**
- Modify: `chrome-extension/src/background/service-worker.ts`

Kein neuer Unit-Test: der Service Worker hat bisher keine Tests. Wir folgen dem bestehenden Pattern (`GET_CREW_ASSIGNMENTS`) und verlassen uns auf den End-to-End-Check über das Widget + `npm run build` im Abschluss.

**Step 1: Add the message type**

In `chrome-extension/src/background/service-worker.ts`, erweitere den Union-Typ:

```ts
type MessageRequest =
  | { type: 'GET_AUTH_STATE' }
  | { type: 'GET_CURRENT_FIRECALL' }
  | { type: 'GET_FIRECALL'; firecallId: string }
  | { type: 'AUTH_STATE_CHANGED' }
  | { type: 'GET_CREW_ASSIGNMENTS' }
  | { type: 'GET_FIRECALL_VEHICLES' };
```

**Step 2: Handle the message in `handleMessage`**

Füge vor dem `default:` einen neuen `case` hinzu:

```ts
case 'GET_FIRECALL_VEHICLES': {
  await ensureAuthenticated();
  if (!currentUser) return { error: 'Not authenticated' };
  const { selectedFirecallId } = await chrome.storage.local.get(
    'selectedFirecallId'
  );
  if (!selectedFirecallId) return { vehicles: [] };
  return getFirecallVehicles(selectedFirecallId);
}
```

**Step 3: Implement `getFirecallVehicles`**

Füge unter `getCrewAssignments` hinzu:

```ts
async function getFirecallVehicles(firecallId: string) {
  const itemsRef = collection(firestore, 'call', firecallId, 'item');
  const snapshot = await getDocs(itemsRef);
  const vehicles = snapshot.docs
    .map((d) => {
      const data = d.data() as { type?: string; name?: string; deleted?: boolean };
      return { id: d.id, type: data.type, name: data.name, deleted: data.deleted };
    })
    .filter((v) => v.type === 'vehicle' && v.deleted !== true && !!v.name)
    .map((v) => ({ id: v.id, name: v.name as string }));
  return { vehicles };
}
```

**Step 4: Typecheck**

```bash
cd chrome-extension && npx tsc --noEmit
```

Expected: no errors.

**Step 5: Commit**

```bash
git add chrome-extension/src/background/service-worker.ts
git commit -m "feat(chrome-extension): add GET_FIRECALL_VEHICLES service-worker message"
```

---

## Task 5: UI-Sektion „Fahrzeuge markieren" im Widget

**Files:**
- Modify: `chrome-extension/src/content/sybos.ts`

**Step 1: Add imports at top of `sybos.ts`**

Ersetze den bestehenden `hasSybosVehicleTable`-Import und füge den neuen Parser + Matcher hinzu. Die finale Import-Sektion (Zeilen 1–8):

```ts
import { hasSybosPersonTable, parseSybosPersonTable } from './sybos-table';
import {
  hasSybosVehicleTable,
  parseSybosVehicleTable,
} from './sybos-vehicle-table';
import {
  hasSybosVehicleList,
  parseSybosVehicleList,
} from './sybos-vehicle-list';
import { findMatchingName } from './name-matching';
import { findMatchingVehicleOption } from './vehicle-matching';
import { findMatchingVehicleListRow } from './vehicle-list-matching';
import WIDGET_CSS from './sybos.css?raw';
```

**Step 2: Add matching helper near the other matchers**

Füge nach `matchAndAssignVehiclesInSybos` eine neue Funktion ein:

```ts
interface VehicleListCheckResult {
  matched: string[];
  notFound: string[];
}

async function matchAndCheckVehicleList(): Promise<VehicleListCheckResult> {
  const response = await chrome.runtime.sendMessage({
    type: 'GET_FIRECALL_VEHICLES',
  });

  if (response.error || !response.vehicles?.length) {
    return { matched: [], notFound: [] };
  }

  const rows = parseSybosVehicleList();
  const matched: string[] = [];
  const notFound: string[] = [];

  for (const vehicle of response.vehicles as Array<{ id: string; name: string }>) {
    const row = findMatchingVehicleListRow(vehicle.name, rows);
    if (row) {
      if (!row.checkbox.checked) {
        row.checkbox.checked = true;
        row.checkbox.dispatchEvent(new Event('change', { bubbles: true }));
      }
      matched.push(vehicle.name);
    } else {
      notFound.push(vehicle.name);
    }
  }

  return { matched, notFound };
}
```

**Step 3: Render the new widget section**

In `showFirecall`, direkt **nach** dem bestehenden `if (hasSybosVehicleTable())`-Block (also vor dem Ende der Funktion, nach der schließenden `}` von diesem Block), ergänze:

```ts
// Show vehicle-list check section when on the SYBOS vehicle-selection page
if (hasSybosVehicleList()) {
  const vlSection = el('div', { className: 'ek-crew-section' });
  vlSection.appendChild(
    el('div', { className: 'ek-crew-title' }, 'Fahrzeuge markieren')
  );

  const vlBtn = el(
    'button',
    { className: 'ek-crew-btn' },
    'Fahrzeuge markieren'
  );
  vlSection.appendChild(vlBtn);

  const vlResult = el('div');
  vlSection.appendChild(vlResult);
  content.appendChild(vlSection);

  vlBtn.addEventListener('click', async () => {
    vlBtn.disabled = true;
    vlBtn.textContent = 'Markiere...';

    try {
      const result = await matchAndCheckVehicleList();
      vlResult.replaceChildren();

      if (result.matched.length > 0) {
        vlResult.appendChild(
          el(
            'div',
            { className: 'ek-crew-result success' },
            `\u2713 ${result.matched.length} markiert`
          )
        );
        for (const name of result.matched) {
          vlResult.appendChild(
            el('div', { className: 'ek-crew-name' }, name)
          );
        }
      }

      if (result.notFound.length > 0) {
        vlResult.appendChild(
          el(
            'div',
            { className: 'ek-crew-result warning' },
            `\u2717 ${result.notFound.length} nicht gefunden`
          )
        );
        for (const name of result.notFound) {
          vlResult.appendChild(
            el('div', { className: 'ek-crew-name' }, name)
          );
        }
      }

      if (result.matched.length === 0 && result.notFound.length === 0) {
        vlResult.appendChild(
          el(
            'div',
            { className: 'ek-crew-result' },
            'Keine Fahrzeuge im Einsatz'
          )
        );
      }
    } catch (err) {
      console.error('[EK] error marking vehicle list:', err);
      vlResult.replaceChildren();
      vlResult.appendChild(
        el(
          'div',
          { className: 'ek-crew-result warning' },
          'Fehler beim Markieren'
        )
      );
    }

    vlBtn.textContent = 'Erneut markieren';
    vlBtn.disabled = false;
  });
}
```

**Step 4: Typecheck + lint**

```bash
cd chrome-extension && npx tsc --noEmit
```

Expected: no errors.

**Step 5: Commit**

```bash
git add chrome-extension/src/content/sybos.ts
git commit -m "feat(chrome-extension): mark SYBOS vehicle-list from firecall vehicles"
```

---

## Task 6: Full-Check

**Step 1: Run chrome-extension tests**

```bash
cd chrome-extension && npm test
```

Expected: alle bestehenden + neuen Tests PASS.

**Step 2: Build chrome-extension (tsc + vite)**

```bash
cd chrome-extension && npm run build
```

Expected: erfolgreicher Build, keine TSC-Errors.

**Step 3: Run repo-wide check (tsc, lint, tests, build of main app)**

Vom Repo-Root:

```bash
npm run check
```

Expected: alle Checks grün. Falls `next-env.d.ts` Änderungen zeigt → `git checkout -- next-env.d.ts`.

Wenn alles grün, ist das Feature implementierungsfertig.

**Step 4: (Kein Commit in diesem Task, außer Änderungen aufgetaucht sind.)**

---

## Hinweise für die Ausführung

- **Arbeitsverzeichnis:** Für Tests, `tsc` und `npm run build` der Extension immer `cd chrome-extension` vorweg. Für `npm run check` (Root) aus dem Repo-Root laufen lassen.
- **Keine TSC-Errors tolerieren:** Auch scheinbar vorbestehende TSC-Fehler müssen gefixt werden, bevor weitergemacht wird (siehe CLAUDE.md).
- **Commit-Messages:** Conventional-Commits, Scope `chrome-extension`.
- **Kein `Co-Authored-By`-Footer** (user-global CLAUDE.md).
- **Kein `git add -A` oder `git add .`.** Immer spezifische Dateien adden.
