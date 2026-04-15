# SYBOS Personal Auto-Check Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Extend the Chrome extension content script to automatically check personnel checkboxes on the SYBOS page based on CrewAssignments from the active firecall.

**Architecture:** The service worker gets a new `GET_CREW_ASSIGNMENTS` message handler that reads the Firestore `crew` subcollection. The content script detects SYBOS personnel tables, fetches crew data via the service worker, and matches names to check the corresponding checkboxes. A name-matching utility handles format differences (name order, casing, diacritics).

**Tech Stack:** Chrome Extension Manifest V3, Firebase Firestore, TypeScript, Vite/CRXJS

---

### Task 1: Fix z-index to prevent SYBOS elements from covering the widget

**Files:**
- Modify: `chrome-extension/src/content/sybos.css:2` (z-index line)

**Step 1: Update z-index to max int32**

In `chrome-extension/src/content/sybos.css`, change the z-index from `999999` to `2147483647`:

```css
#einsatzkarte-widget {
  position: fixed;
  top: 80px;
  right: 0;
  z-index: 2147483647;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  font-size: 14px;
}
```

**Step 2: Build and verify**

Run: `cd chrome-extension && npm run build`

**Step 3: Commit**

```bash
git add chrome-extension/src/content/sybos.css
git commit -m "fix(chrome-extension): increase content script z-index to max int32"
```

---

### Task 2: Add name-matching utility with tests

**Files:**
- Create: `chrome-extension/src/content/name-matching.ts`
- Create: `chrome-extension/src/content/name-matching.test.ts`

**Step 1: Write the failing tests**

Create `chrome-extension/src/content/name-matching.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { normalizeName, findMatchingName } from './name-matching';

describe('normalizeName', () => {
  it('lowercases and trims', () => {
    expect(normalizeName('  Boehm Herbert  ')).toBe('boehm herbert');
  });

  it('removes diacritics', () => {
    expect(normalizeName('Mueller Guenther')).toBe('mueller guenther');
  });

  it('collapses whitespace', () => {
    expect(normalizeName('Name   Test')).toBe('name test');
  });
});

describe('findMatchingName', () => {
  const sybosNames = ['Name Herbert', 'Mueller Franz', 'Gruber Anna Maria'];

  it('matches exact name', () => {
    expect(findMatchingName('Name Herbert', sybosNames)).toBe('Name Herbert');
  });

  it('matches case-insensitive', () => {
    expect(findMatchingName('name herbert', sybosNames)).toBe('Name Herbert');
  });

  it('matches reversed name order', () => {
    expect(findMatchingName('Herbert Name', sybosNames)).toBe('Name Herbert');
  });

  it('returns null for no match', () => {
    expect(findMatchingName('Unbekannt Max', sybosNames)).toBeNull();
  });

  it('matches substring (multi-part name)', () => {
    expect(findMatchingName('Gruber Anna', sybosNames)).toBe('Gruber Anna Maria');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd chrome-extension && npx vitest run src/content/name-matching.test.ts`
Expected: FAIL - module not found

**Step 3: Implement the name-matching utility**

Create `chrome-extension/src/content/name-matching.ts`:

```typescript
/**
 * Normalize a name for comparison: lowercase, strip diacritics, collapse whitespace.
 */
export function normalizeName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ');
}

/**
 * Find the best matching SYBOS name for a given Einsatzkarte name.
 * Returns the original (un-normalized) SYBOS name, or null if no match.
 *
 * Matching strategy:
 * 1. Exact match (after normalization)
 * 2. Reversed name order ("Vorname Nachname" <-> "Nachname Vorname")
 * 3. Substring containment (for multi-part names)
 */
export function findMatchingName(
  ekName: string,
  sybosNames: string[]
): string | null {
  const normalizedEk = normalizeName(ekName);

  // Build lookup map: normalized -> original
  const nameMap = new Map<string, string>();
  for (const sybosName of sybosNames) {
    nameMap.set(normalizeName(sybosName), sybosName);
  }

  // 1. Exact match
  const exact = nameMap.get(normalizedEk);
  if (exact) return exact;

  // 2. Reversed name order
  const parts = normalizedEk.split(' ');
  if (parts.length >= 2) {
    const reversed = [...parts].reverse().join(' ');
    const revMatch = nameMap.get(reversed);
    if (revMatch) return revMatch;
  }

  // 3. Substring containment
  for (const [normalizedSybos, original] of nameMap) {
    if (
      normalizedSybos.includes(normalizedEk) ||
      normalizedEk.includes(normalizedSybos)
    ) {
      return original;
    }
  }

  return null;
}
```

**Step 4: Run tests to verify they pass**

Run: `cd chrome-extension && npx vitest run src/content/name-matching.test.ts`
Expected: All tests PASS

**Step 5: Commit**

```bash
git add chrome-extension/src/content/name-matching.ts chrome-extension/src/content/name-matching.test.ts
git commit -m "feat(chrome-extension): add name-matching utility for SYBOS personnel"
```

---

### Task 3: Add `GET_CREW_ASSIGNMENTS` handler to service worker

**Files:**
- Modify: `chrome-extension/src/background/service-worker.ts`

**Step 1: Add Firestore collection imports**

In `chrome-extension/src/background/service-worker.ts:9`, extend the Firestore import:

```typescript
import { getFirestore, doc, getDoc, collection, getDocs } from 'firebase/firestore';
```

**Step 2: Add message type**

Add `GET_CREW_ASSIGNMENTS` to the `MessageRequest` union:

```typescript
type MessageRequest =
  | { type: 'GET_AUTH_STATE' }
  | { type: 'GET_CURRENT_FIRECALL' }
  | { type: 'GET_FIRECALL'; firecallId: string }
  | { type: 'AUTH_STATE_CHANGED' }
  | { type: 'GET_CREW_ASSIGNMENTS' };
```

**Step 3: Add handler in the switch statement**

Add a new case before the `default` in `handleMessage`:

```typescript
    case 'GET_CREW_ASSIGNMENTS': {
      await ensureAuthenticated();
      if (!currentUser) return { error: 'Not authenticated' };
      const { selectedFirecallId } = await chrome.storage.local.get(
        'selectedFirecallId'
      );
      if (!selectedFirecallId) return { assignments: [] };
      return getCrewAssignments(selectedFirecallId);
    }
```

**Step 4: Add the `getCrewAssignments` function**

After the `getFirecallData` function:

```typescript
async function getCrewAssignments(firecallId: string) {
  const crewRef = collection(firestore, 'call', firecallId, 'crew');
  const snapshot = await getDocs(crewRef);
  const assignments = snapshot.docs.map((d) => ({
    id: d.id,
    ...d.data(),
  }));
  return { assignments };
}
```

**Step 5: Build and verify**

Run: `cd chrome-extension && npm run build`
Expected: Build succeeds without errors

**Step 6: Commit**

```bash
git add chrome-extension/src/background/service-worker.ts
git commit -m "feat(chrome-extension): add GET_CREW_ASSIGNMENTS service worker handler"
```

---

### Task 4: Add SYBOS table parsing to content script

**Files:**
- Create: `chrome-extension/src/content/sybos-table.ts`
- Create: `chrome-extension/src/content/sybos-table.test.ts`

**Step 1: Write the failing tests**

Create `chrome-extension/src/content/sybos-table.test.ts`. The tests use `document.body` DOM APIs with hardcoded test fixture strings (safe, no untrusted input):

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { parseSybosPersonTable } from './sybos-table';

function addPersonRow(container: HTMLElement, id: string, name: string) {
  const wrapper = document.createElement('div');
  wrapper.className = 'x-grid3-cell-inner x-grid3-col-selected';

  const hidden1 = document.createElement('input');
  hidden1.type = 'hidden';
  hidden1.name = `BListMulti[]`;
  hidden1.value = id;
  wrapper.appendChild(hidden1);

  const checkbox = document.createElement('input');
  checkbox.type = 'checkbox';
  checkbox.name = `selected[${id}]`;
  checkbox.className = 'checkbox';
  checkbox.value = id;
  wrapper.appendChild(checkbox);

  const hidden2 = document.createElement('input');
  hidden2.type = 'hidden';
  hidden2.name = `name_tbl[${id}]`;
  hidden2.value = id;
  wrapper.appendChild(hidden2);

  const nameInput = document.createElement('input');
  nameInput.type = 'hidden';
  nameInput.name = `name_tbl[deleted[${id}]]`;
  nameInput.value = name;
  wrapper.appendChild(nameInput);

  container.appendChild(wrapper);
}

describe('parseSybosPersonTable', () => {
  beforeEach(() => {
    document.body.replaceChildren();
  });

  it('parses person entries from the DOM', () => {
    addPersonRow(document.body, '1406', 'Name Herbert');
    addPersonRow(document.body, '1407', 'Mueller Franz');

    const result = parseSybosPersonTable();
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({
      id: '1406',
      name: 'Name Herbert',
      checkbox: expect.any(HTMLInputElement),
    });
    expect(result[1]).toEqual({
      id: '1407',
      name: 'Mueller Franz',
      checkbox: expect.any(HTMLInputElement),
    });
  });

  it('returns empty array when no person table exists', () => {
    const div = document.createElement('div');
    div.textContent = 'No table here';
    document.body.appendChild(div);
    expect(parseSybosPersonTable()).toEqual([]);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd chrome-extension && npx vitest run src/content/sybos-table.test.ts`
Expected: FAIL - module not found

**Step 3: Implement the SYBOS table parser**

Create `chrome-extension/src/content/sybos-table.ts`:

```typescript
export interface SybosPerson {
  id: string;
  name: string;
  checkbox: HTMLInputElement;
}

/**
 * Parse the SYBOS personnel table from the current page DOM.
 * Finds all hidden inputs with name pattern name_tbl[deleted[ID]]
 * and pairs them with their corresponding checkboxes.
 */
export function parseSybosPersonTable(): SybosPerson[] {
  const nameInputs = document.querySelectorAll<HTMLInputElement>(
    'input[type="hidden"][name^="name_tbl[deleted["]'
  );

  const persons: SybosPerson[] = [];

  for (const nameInput of nameInputs) {
    const name = nameInput.value;
    const match = nameInput.name.match(/name_tbl\[deleted\[(\d+)\]\]/);
    if (!match) continue;

    const id = match[1];
    const checkbox = document.querySelector<HTMLInputElement>(
      `input[type="checkbox"][name="selected[${id}]"]`
    );
    if (!checkbox) continue;

    persons.push({ id, name, checkbox });
  }

  return persons;
}

/**
 * Check if the current page contains a SYBOS personnel table.
 */
export function hasSybosPersonTable(): boolean {
  return (
    document.querySelectorAll(
      'input[type="hidden"][name^="name_tbl[deleted["]'
    ).length > 0
  );
}
```

**Step 4: Run tests to verify they pass**

Run: `cd chrome-extension && npx vitest run src/content/sybos-table.test.ts`
Expected: All tests PASS

**Step 5: Commit**

```bash
git add chrome-extension/src/content/sybos-table.ts chrome-extension/src/content/sybos-table.test.ts
git commit -m "feat(chrome-extension): add SYBOS personnel table parser"
```

---

### Task 5: Add CSS for personnel matching results in the panel

**Files:**
- Modify: `chrome-extension/src/content/sybos.css`

**Step 1: Add styles for the matching UI**

Append to `chrome-extension/src/content/sybos.css`:

```css
#einsatzkarte-widget .ek-crew-section {
  margin-top: 12px;
  border-top: 1px solid #eee;
  padding-top: 8px;
}

#einsatzkarte-widget .ek-crew-title {
  font-weight: 600;
  font-size: 12px;
  color: #d32f2f;
  margin-bottom: 6px;
}

#einsatzkarte-widget .ek-crew-btn {
  display: block;
  width: 100%;
  padding: 6px 12px;
  background: #d32f2f;
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 13px;
  font-weight: 500;
  margin-bottom: 8px;
}

#einsatzkarte-widget .ek-crew-btn:hover {
  background: #b71c1c;
}

#einsatzkarte-widget .ek-crew-btn:disabled {
  background: #999;
  cursor: not-allowed;
}

#einsatzkarte-widget .ek-crew-result {
  font-size: 12px;
  margin-top: 4px;
}

#einsatzkarte-widget .ek-crew-result.success {
  color: #2e7d32;
}

#einsatzkarte-widget .ek-crew-result.warning {
  color: #e65100;
}

#einsatzkarte-widget .ek-crew-name {
  font-size: 11px;
  color: #666;
  padding-left: 8px;
}
```

**Step 2: Commit**

```bash
git add chrome-extension/src/content/sybos.css
git commit -m "feat(chrome-extension): add CSS for personnel matching UI"
```

---

### Task 6: Integrate auto-check into the content script

**Files:**
- Modify: `chrome-extension/src/content/sybos.ts`

**Step 1: Add imports at the top**

After the CSS import on line 1:

```typescript
import { hasSybosPersonTable, parseSybosPersonTable } from './sybos-table';
import { findMatchingName } from './name-matching';
```

**Step 2: Add the crew matching function**

After the `showFirecall` function (after line 111), add:

```typescript
interface MatchResult {
  matched: string[];
  notFound: string[];
}

async function matchAndCheckPersonnel(): Promise<MatchResult> {
  const response = await chrome.runtime.sendMessage({
    type: 'GET_CREW_ASSIGNMENTS',
  });

  if (response.error || !response.assignments?.length) {
    return { matched: [], notFound: [] };
  }

  const persons = parseSybosPersonTable();
  const sybosNames = persons.map((p) => p.name);
  const matched: string[] = [];
  const notFound: string[] = [];

  for (const assignment of response.assignments) {
    const name: string = assignment.name;
    const matchedSybosName = findMatchingName(name, sybosNames);

    if (matchedSybosName) {
      const person = persons.find((p) => p.name === matchedSybosName);
      if (person && !person.checkbox.checked) {
        person.checkbox.checked = true;
        // Dispatch change event so SYBOS JavaScript picks up the state change
        person.checkbox.dispatchEvent(new Event('change', { bubbles: true }));
      }
      matched.push(name);
    } else {
      notFound.push(name);
    }
  }

  return { matched, notFound };
}
```

**Step 3: Add the crew section to the panel UI**

Inside `showFirecall`, after `content.appendChild(link)` (after the link element), add:

```typescript
  // Show crew matching section if SYBOS person table detected
  if (hasSybosPersonTable()) {
    const crewSection = el('div', { className: 'ek-crew-section' });
    crewSection.appendChild(
      el('div', { className: 'ek-crew-title' }, 'Personal')
    );

    const matchBtn = el(
      'button',
      { className: 'ek-crew-btn' },
      'Personal markieren'
    );
    crewSection.appendChild(matchBtn);

    const resultArea = el('div');
    crewSection.appendChild(resultArea);
    content.appendChild(crewSection);

    matchBtn.addEventListener('click', async () => {
      matchBtn.disabled = true;
      matchBtn.textContent = 'Markiere...';

      const result = await matchAndCheckPersonnel();

      resultArea.replaceChildren();

      if (result.matched.length > 0) {
        const successDiv = el(
          'div',
          { className: 'ek-crew-result success' },
          `\u2713 ${result.matched.length} markiert`
        );
        resultArea.appendChild(successDiv);
        for (const name of result.matched) {
          resultArea.appendChild(
            el('div', { className: 'ek-crew-name' }, name)
          );
        }
      }

      if (result.notFound.length > 0) {
        const warnDiv = el(
          'div',
          { className: 'ek-crew-result warning' },
          `\u2717 ${result.notFound.length} nicht gefunden`
        );
        resultArea.appendChild(warnDiv);
        for (const name of result.notFound) {
          resultArea.appendChild(
            el('div', { className: 'ek-crew-name' }, name)
          );
        }
      }

      if (result.matched.length === 0 && result.notFound.length === 0) {
        resultArea.appendChild(
          el(
            'div',
            { className: 'ek-crew-result' },
            'Keine Besatzung im Einsatz'
          )
        );
      }

      matchBtn.textContent = 'Erneut markieren';
      matchBtn.disabled = false;
    });
  }
```

**Step 4: Build and verify**

Run: `cd chrome-extension && npm run build`
Expected: Build succeeds

**Step 5: Commit**

```bash
git add chrome-extension/src/content/sybos.ts
git commit -m "feat(chrome-extension): integrate SYBOS personnel auto-check in content script"
```

---

### Task 7: Manual integration test

**Step 1: Load extension in Chrome**

1. Open `chrome://extensions`
2. Enable "Developer mode"
3. Click "Load unpacked" and select `chrome-extension/dist/`
4. Sign in via the extension popup
5. Select an active firecall with crew assignments

**Step 2: Test on SYBOS**

1. Navigate to the SYBOS "Personal hinzufuegen" page
2. Verify the EK toggle button is visible (not covered by page elements)
3. Click the toggle to open the panel
4. Verify firecall info is displayed
5. Verify "Personal" section with "Personal markieren" button appears
6. Click "Personal markieren"
7. Verify matching checkboxes are checked in the SYBOS table
8. Verify result shows matched/not-found names correctly

**Step 3: Test edge cases**

- Panel on a SYBOS page without personnel table: "Personal" section should NOT appear
- No crew assignments in firecall: Button click shows "Keine Besatzung im Einsatz"
- Already checked checkboxes: Should not be double-checked, no errors

---

### Task 8: Run all checks and final commit

**Step 1: Run TypeScript check**

Run: `cd chrome-extension && npx tsc --noEmit`
Expected: No TypeScript errors

**Step 2: Run all tests**

Run: `cd chrome-extension && npx vitest run`
Expected: All tests pass

**Step 3: Build**

Run: `cd chrome-extension && npm run build`
Expected: Clean build
