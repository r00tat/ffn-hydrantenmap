# Mehrere BlaulichtSMS-Alarme pro Einsatz — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Einem Einsatz (Firecall) können mehrere BlaulichtSMS-Alarme zugeordnet werden; die Besatzung kombiniert die Zusagen aller Alarme, und zusätzliche (nicht-zusagende) Personen lassen sich per Autocomplete ergänzen.

**Architecture:** `Firecall` erhält ein neues Array-Feld `blaulichtSmsAlarmIds` (Quelle der Wahrheit) neben dem beibehaltenen Legacy-Skalar `blaulichtSmsAlarmId`. Ein Helper `firecallAlarmIds()` liest Array-oder-Skalar. Crew-Einträge bekommen ein Herkunftsfeld `source: 'alarm' | 'manual'`, sodass automatisch synchronisierte Zusagen live bleiben (sichtbar solange in der Vereinigung aller `yes`), explizit ergänzte Personen aber dauerhaft bleiben. UI: Multi-Select für Alarme im Einsatz-Dialog, mehrere `AlarmCard`s in den Details, und ein `Autocomplete freeSolo` für zusätzliche Personen.

**Tech Stack:** Next.js 16 (App Router), React 19, TypeScript, MUI, Firebase Firestore, Vitest + @testing-library/react, next-intl.

**Vollständige Spec:** `docs/superpowers/specs/2026-07-20-multiple-blaulichtsms-alarms-design.md`

---

## Wichtige Konventionen (aus CLAUDE.md)

- **TDD:** Zuerst den fehlschlagenden Test schreiben, fehlschlagen sehen, dann minimal implementieren.
- **TypeScript-Fehler sind niemals zu ignorieren.** `npx tsc --noEmit` muss sauber sein.
- **Tests:** Vitest, Dateien direkt neben der Quelldatei (`*.test.ts` / `*.test.tsx`), **kein** `__tests__/`-Ordner.
- **Intl-Tests:** Komponenten mit `renderWithIntl` aus `src/test-utils/intlRender.tsx` rendern.
- **i18n:** Neue Strings in **beiden** Katalogen (`messages/de.json` **und** `messages/en.json`), Schlüssel englisch/camelCase.
- **grep auf diesem Mac ist ugrep:** ggf. `LC_ALL=C /usr/bin/grep` verwenden.
- **Commits:** Conventional Commits, keine `Co-Authored-By`-Zeile. Erst `git add`, dann separat `git commit`.
- Tests einzeln laufen lassen mit `NO_COLOR=1 npx vitest run <pfad>`.

---

## Task 1: Datenmodell — `firecallAlarmIds`-Helper und `source`-Feld

**Files:**
- Modify: `src/components/firebase/firestore.ts` (Interface `Firecall` ~Zeile 286-302, `CrewAssignment` ~Zeile 321-330; neuer Helper)
- Test: `src/components/firebase/firecallAlarmIds.test.ts` (neu)

- [ ] **Step 1: Fehlschlagenden Test für `firecallAlarmIds` schreiben**

Create `src/components/firebase/firecallAlarmIds.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { firecallAlarmIds } from './firestore';
import type { Firecall } from './firestore';

describe('firecallAlarmIds', () => {
  it('returns the array when blaulichtSmsAlarmIds is set', () => {
    const fc = { name: 'x', blaulichtSmsAlarmIds: ['a', 'b'] } as Firecall;
    expect(firecallAlarmIds(fc)).toEqual(['a', 'b']);
  });

  it('falls back to the legacy scalar when only blaulichtSmsAlarmId is set', () => {
    const fc = { name: 'x', blaulichtSmsAlarmId: 'legacy' } as Firecall;
    expect(firecallAlarmIds(fc)).toEqual(['legacy']);
  });

  it('returns an empty array when neither field is set', () => {
    const fc = { name: 'x' } as Firecall;
    expect(firecallAlarmIds(fc)).toEqual([]);
  });

  it('prefers the array even if the scalar is also present', () => {
    const fc = {
      name: 'x',
      blaulichtSmsAlarmId: 'legacy',
      blaulichtSmsAlarmIds: ['a', 'b'],
    } as Firecall;
    expect(firecallAlarmIds(fc)).toEqual(['a', 'b']);
  });
});
```

- [ ] **Step 2: Test laufen lassen, Fehlschlag bestätigen**

Run: `NO_COLOR=1 npx vitest run src/components/firebase/firecallAlarmIds.test.ts`
Expected: FAIL — `firecallAlarmIds is not a function` / Import-Fehler.

- [ ] **Step 3: `Firecall`-Interface erweitern**

In `src/components/firebase/firestore.ts`, im `Firecall`-Interface direkt nach `blaulichtSmsAlarmId?: string;` (Zeile 300) einfügen:

```ts
  blaulichtSmsAlarmId?: string; // Legacy: primärer Alarm (bleibt für Abwärtskompatibilität)
  blaulichtSmsAlarmIds?: string[]; // Quelle der Wahrheit für zugeordnete Alarme
```

- [ ] **Step 4: `CrewAssignment`-Interface erweitern**

Im `CrewAssignment`-Interface (nach `funktion: CrewFunktion;`) einfügen:

```ts
  source?: 'alarm' | 'manual'; // undefined = 'alarm' (Legacy-Einträge)
```

- [ ] **Step 5: Helper `firecallAlarmIds` hinzufügen**

In `src/components/firebase/firestore.ts` (z.B. direkt nach dem `Firecall`-Interface) hinzufügen:

```ts
export function firecallAlarmIds(fc: Firecall): string[] {
  if (fc.blaulichtSmsAlarmIds && fc.blaulichtSmsAlarmIds.length > 0) {
    return fc.blaulichtSmsAlarmIds;
  }
  return fc.blaulichtSmsAlarmId ? [fc.blaulichtSmsAlarmId] : [];
}
```

- [ ] **Step 6: Test laufen lassen, Erfolg bestätigen**

Run: `NO_COLOR=1 npx vitest run src/components/firebase/firecallAlarmIds.test.ts`
Expected: PASS (4 Tests).

- [ ] **Step 7: TypeScript-Check**

Run: `npx tsc --noEmit`
Expected: keine Fehler.

- [ ] **Step 8: Commit**

```bash
git add src/components/firebase/firestore.ts src/components/firebase/firecallAlarmIds.test.ts
git commit -m "feat(einsatz): Datenmodell für mehrere Alarme und Crew-Herkunft"
```

---

## Task 2: Crew-Sync — `syncFromAlarms`, `source`-Feld, `addPersonFromRecipient`

**Files:**
- Modify: `src/hooks/useCrewAssignments.ts`
- Test: `src/hooks/useCrewAssignments.test.ts`

Der Hook exportiert künftig `syncFromAlarms` (Plural, nimmt Alarm-Array) statt/zusätzlich zu `syncFromAlarm`. Wir **ersetzen** `syncFromAlarm` durch `syncFromAlarms`, da es nur einen Aufrufer (`CrewAssignmentBoard`) gibt, der in Task 4 mit umgestellt wird.

- [ ] **Step 1: Bestehende `syncFromAlarm`-Tests auf `syncFromAlarms` umstellen und erweitern**

In `src/hooks/useCrewAssignments.test.ts` den `describe('syncFromAlarm', …)`-Block ersetzen durch:

```ts
  describe('syncFromAlarms', () => {
    const makeAlarm = (
      alarmId: string,
      recipients: BlaulichtSmsRecipient[],
    ) =>
      ({
        alarmId,
        recipients,
      }) as unknown as import('../app/blaulicht-sms/actions').BlaulichtSmsAlarm;

    it('creates docs for new yes recipients with source alarm', async () => {
      const alarm = makeAlarm('alarm1', [
        { id: 'r1', name: 'Alice', participation: 'yes' },
        { id: 'r2', name: 'Bob', participation: 'yes' },
      ]);

      const { result } = renderHook(() => useCrewAssignments());
      await act(async () => {
        await result.current.syncFromAlarms([alarm]);
      });

      expect(mockAddDoc).toHaveBeenCalledTimes(2);
      expect(mockAddDoc).toHaveBeenCalledWith(
        expect.objectContaining({ path: expect.stringContaining('crew') }),
        expect.objectContaining({
          recipientId: 'r1',
          name: 'Alice',
          funktion: 'Feuerwehrmann',
          source: 'alarm',
          updatedBy: 'test@example.com',
        }),
      );
    });

    it('skips recipients with participation other than yes', async () => {
      const alarm = makeAlarm('alarm1', [
        { id: 'r1', name: 'Alice', participation: 'yes' },
        { id: 'r2', name: 'Bob', participation: 'no' },
        { id: 'r3', name: 'Carol', participation: 'pending' },
      ]);

      const { result } = renderHook(() => useCrewAssignments());
      await act(async () => {
        await result.current.syncFromAlarms([alarm]);
      });

      expect(mockAddDoc).toHaveBeenCalledTimes(1);
      expect(mockAddDoc).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ recipientId: 'r1', name: 'Alice' }),
      );
    });

    it('unions yes recipients across multiple alarms and dedupes by id', async () => {
      const alarm1 = makeAlarm('alarm1', [
        { id: 'r1', name: 'Alice', participation: 'yes' },
      ]);
      const alarm2 = makeAlarm('alarm2', [
        { id: 'r1', name: 'Alice', participation: 'yes' }, // dup
        { id: 'r2', name: 'Bob', participation: 'yes' }, // Nachalarm
      ]);

      const { result } = renderHook(() => useCrewAssignments());
      await act(async () => {
        await result.current.syncFromAlarms([alarm1, alarm2]);
      });

      // r1 only once + r2 => 2 addDoc calls
      expect(mockAddDoc).toHaveBeenCalledTimes(2);
    });

    it('skips recipients that already exist in crew assignments', async () => {
      mockGetDocsResult.docs = [
        { data: () => ({ recipientId: 'r1', name: 'Alice' }) },
      ];
      const alarm = makeAlarm('alarm1', [
        { id: 'r1', name: 'Alice', participation: 'yes' },
        { id: 'r2', name: 'Bob', participation: 'yes' },
      ]);

      const { result } = renderHook(() => useCrewAssignments());
      await act(async () => {
        await result.current.syncFromAlarms([alarm]);
      });

      expect(mockAddDoc).toHaveBeenCalledTimes(1);
      expect(mockAddDoc).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ recipientId: 'r2', name: 'Bob' }),
      );
    });
  });

  describe('addPersonFromRecipient', () => {
    it('creates a manual-source doc with the real recipient id', async () => {
      const { result } = renderHook(() => useCrewAssignments());
      await act(async () => {
        await result.current.addPersonFromRecipient({
          id: 'r9',
          name: 'Declined Dan',
          participation: 'no',
        });
      });

      expect(mockAddDoc).toHaveBeenCalledTimes(1);
      expect(mockAddDoc).toHaveBeenCalledWith(
        expect.objectContaining({ path: expect.stringContaining('crew') }),
        expect.objectContaining({
          recipientId: 'r9',
          name: 'Declined Dan',
          source: 'manual',
          funktion: 'Feuerwehrmann',
        }),
      );
    });

    it('does not create a duplicate when the recipient already exists', async () => {
      mockGetDocsResult.docs = [
        { data: () => ({ recipientId: 'r9', name: 'Declined Dan' }) },
      ];
      const { result } = renderHook(() => useCrewAssignments());
      await act(async () => {
        await result.current.addPersonFromRecipient({
          id: 'r9',
          name: 'Declined Dan',
          participation: 'no',
        });
      });

      expect(mockAddDoc).not.toHaveBeenCalled();
    });
  });
```

Außerdem im `addManualPerson`-Bereich (falls noch nicht vorhanden) einen Test ergänzen — neuer `describe`-Block:

```ts
  describe('addManualPerson', () => {
    it('creates a manual-source doc with a manual- recipient id', async () => {
      const { result } = renderHook(() => useCrewAssignments());
      await act(async () => {
        await result.current.addManualPerson('Walk-In Willy');
      });

      expect(mockAddDoc).toHaveBeenCalledTimes(1);
      expect(mockAddDoc).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          name: 'Walk-In Willy',
          source: 'manual',
          recipientId: expect.stringContaining('manual-'),
        }),
      );
    });
  });
```

- [ ] **Step 2: Test laufen lassen, Fehlschlag bestätigen**

Run: `NO_COLOR=1 npx vitest run src/hooks/useCrewAssignments.test.ts`
Expected: FAIL — `syncFromAlarms is not a function`, `addPersonFromRecipient is not a function`, und `source`-Erwartungen schlagen fehl.

- [ ] **Step 3: `syncFromAlarm` → `syncFromAlarms` umbauen**

In `src/hooks/useCrewAssignments.ts`:

- Import ergänzen: `import { BlaulichtSmsAlarm } from '../app/blaulicht-sms/actions';`
- Die `syncFromAlarm`-Funktion (Zeilen ~54-114) ersetzen durch:

```ts
  // syncFromAlarms reads Firestore directly (getDocs) to avoid race conditions
  // with the realtime listener. Also cleans up duplicates from earlier bugs.
  // Unions confirmed (yes) recipients across ALL assigned alarms.
  const syncFromAlarms = useCallback(
    async (alarms: BlaulichtSmsAlarm[]) => {
      if (!crewCollectionRef) return;

      // Union of yes recipients across all alarms, deduped by recipient id
      const confirmedById = new Map<string, BlaulichtSmsRecipient>();
      for (const alarm of alarms) {
        for (const r of alarm.recipients) {
          if (r.participation === 'yes' && !confirmedById.has(r.id)) {
            confirmedById.set(r.id, {
              id: r.id,
              name: r.name,
              participation: r.participation,
            });
          }
        }
      }
      const confirmed = [...confirmedById.values()];
      if (confirmed.length === 0) return;

      // Read current state directly from Firestore
      const snapshot = await getDocs(
        query(crewCollectionRef) as Query<CrewAssignment>
      );

      // Clean up duplicates: keep only the first doc per recipientId
      const seenIds = new Set<string>();
      const duplicateDocs: string[] = [];
      for (const d of snapshot.docs) {
        const rid = d.data().recipientId;
        if (seenIds.has(rid)) {
          duplicateDocs.push(d.id);
        } else {
          seenIds.add(rid);
        }
      }
      if (duplicateDocs.length > 0) {
        await Promise.all(
          duplicateDocs.map((id) =>
            deleteDoc(
              doc(
                firestore,
                FIRECALL_COLLECTION_ID,
                firecallId,
                FIRECALL_CREW_COLLECTION_ID,
                id
              )
            )
          )
        );
      }

      // Create docs for new confirmed recipients
      const newRecipients = confirmed.filter((r) => !seenIds.has(r.id));
      if (newRecipients.length === 0) return;

      const now = new Date().toISOString();
      await Promise.all(
        newRecipients.map((r) =>
          addDoc(crewCollectionRef, {
            recipientId: r.id,
            name: r.name,
            vehicleId: null,
            vehicleName: '',
            funktion: 'Feuerwehrmann' as CrewFunktion,
            source: 'alarm' as const,
            updatedAt: now,
            updatedBy: email || '',
          })
        )
      );
    },
    [crewCollectionRef, email, firecallId]
  );
```

- [ ] **Step 4: `addManualPerson` um `source: 'manual'` ergänzen**

Im `addManualPerson`-`addDoc`-Aufruf das Objekt um `source: 'manual' as const,` erweitern (nach `funktion`).

- [ ] **Step 5: `addPersonFromRecipient` hinzufügen**

Nach `addManualPerson` einfügen:

```ts
  const addPersonFromRecipient = useCallback(
    async (recipient: BlaulichtSmsRecipient) => {
      if (!crewCollectionRef) return;

      // Avoid duplicates: check current Firestore state for this recipient id
      const snapshot = await getDocs(
        query(crewCollectionRef) as Query<CrewAssignment>
      );
      if (snapshot.docs.some((d) => d.data().recipientId === recipient.id)) {
        return;
      }

      await addDoc(crewCollectionRef, {
        recipientId: recipient.id,
        name: recipient.name,
        vehicleId: null,
        vehicleName: '',
        funktion: 'Feuerwehrmann' as CrewFunktion,
        source: 'manual' as const,
        updatedAt: new Date().toISOString(),
        updatedBy: email || '',
      });
    },
    [crewCollectionRef, email]
  );
```

- [ ] **Step 6: Return-Objekt anpassen**

Im `return { … }` `syncFromAlarm` durch `syncFromAlarms` ersetzen und `addPersonFromRecipient` ergänzen:

```ts
  return {
    crewAssignments,
    syncFromAlarms,
    addManualPerson,
    addPersonFromRecipient,
    assignVehicle,
    updateFunktion,
    removeAssignment,
  };
```

- [ ] **Step 7: Test laufen lassen, Erfolg bestätigen**

Run: `NO_COLOR=1 npx vitest run src/hooks/useCrewAssignments.test.ts`
Expected: PASS.

- [ ] **Step 8: TypeScript-Check**

Run: `npx tsc --noEmit`
Expected: **Ein** erwarteter Fehler in `CrewAssignmentBoard.tsx` (nutzt noch `syncFromAlarm`). Das wird in Task 4 behoben. Falls andere Fehler auftreten → beheben. (Hinweis: `CrewAssignmentBoard.test.tsx` mockt den Hook und schlägt separat fehl — ebenfalls Task 4.)

- [ ] **Step 9: Commit**

```bash
git add src/hooks/useCrewAssignments.ts src/hooks/useCrewAssignments.test.ts
git commit -m "feat(crew): Zusagen über mehrere Alarme vereinen und Personen aus Recipients ergänzen"
```

---

## Task 3: `resetEinsatzToManual` löscht auch `blaulichtSmsAlarmIds`

**Files:**
- Modify: `src/components/FirecallItems/einsatzDefaults.ts`
- Test: `src/components/FirecallItems/einsatzDefaults.test.ts`

- [ ] **Step 1: Fehlschlagenden Test ergänzen**

In `src/components/FirecallItems/einsatzDefaults.test.ts`, im ersten `resetEinsatzToManual`-Test das `current`-Objekt um `blaulichtSmsAlarmIds: ['alarm-123', 'alarm-456'],` erweitern (nach `blaulichtSmsAlarmId`) und eine Assertion ergänzen (nach der `blaulichtSmsAlarmId`-Assertion):

```ts
    expect(reset.blaulichtSmsAlarmIds).toBeUndefined();
```

- [ ] **Step 2: Test laufen lassen, Fehlschlag bestätigen**

Run: `NO_COLOR=1 npx vitest run src/components/FirecallItems/einsatzDefaults.test.ts`
Expected: FAIL — `reset.blaulichtSmsAlarmIds` ist nicht `undefined`.

- [ ] **Step 3: `resetEinsatzToManual` erweitern**

In `src/components/FirecallItems/einsatzDefaults.ts` im Rückgabeobjekt nach `blaulichtSmsAlarmId: undefined,` einfügen:

```ts
    blaulichtSmsAlarmIds: undefined,
```

- [ ] **Step 4: Test laufen lassen, Erfolg bestätigen**

Run: `NO_COLOR=1 npx vitest run src/components/FirecallItems/einsatzDefaults.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/FirecallItems/einsatzDefaults.ts src/components/FirecallItems/einsatzDefaults.test.ts
git commit -m "fix(einsatz): resetEinsatzToManual löscht Alarm-Liste"
```

---

## Task 4: CrewAssignmentBoard — Multi-Alarm, Sichtbarkeitsfilter, Autocomplete

**Files:**
- Modify: `src/components/pages/CrewAssignmentBoard.tsx`
- Test: `src/components/pages/CrewAssignmentBoard.test.tsx`
- Modify: `messages/de.json`, `messages/en.json`

### 4a — i18n-Keys (zuerst, damit Tests darauf zugreifen können)

- [ ] **Step 1: Keys in `messages/de.json` ergänzen**

Im `"crew"`-Objekt (nach `"addPerson": "Person hinzufügen",`) einfügen:

```json
    "additionalPersons": "Weitere Person hinzufügen",
    "statusDeclined": "abgelehnt",
    "statusNoAnswer": "nicht geantwortet",
    "statusPending": "ausstehend",
```

- [ ] **Step 2: Dieselben Keys in `messages/en.json` ergänzen**

Im `"crew"`-Objekt einfügen:

```json
    "additionalPersons": "Add another person",
    "statusDeclined": "declined",
    "statusNoAnswer": "no answer",
    "statusPending": "pending",
```

### 4b — Tests

- [ ] **Step 3: Test-Datei auf Multi-Alarm + neue Semantik umstellen**

In `src/components/pages/CrewAssignmentBoard.test.tsx`:

**(a)** Den Hook-Mock (Zeilen ~70-78) anpassen — `syncFromAlarm` → `syncFromAlarms`, `addPersonFromRecipient` und `addManualPerson` ergänzen. Zuerst oben im `vi.hoisted`-Block (Zeilen ~10-22) die Mocks umbenennen/ergänzen:

```ts
const {
  mockSyncFromAlarms,
  mockAddManualPerson,
  mockAddPersonFromRecipient,
  mockAssignVehicle,
  mockUpdateFunktion,
  mockRemoveAssignment,
  mockUseMediaQuery,
} = vi.hoisted(() => ({
  mockSyncFromAlarms: vi.fn(),
  mockAddManualPerson: vi.fn(),
  mockAddPersonFromRecipient: vi.fn(),
  mockAssignVehicle: vi.fn(),
  mockUpdateFunktion: vi.fn(),
  mockRemoveAssignment: vi.fn(),
  mockUseMediaQuery: vi.fn(() => false),
}));
```

Und den Hook-Mock:

```ts
vi.mock('../../hooks/useCrewAssignments', () => ({
  default: () => ({
    crewAssignments: mockAssignments,
    syncFromAlarms: mockSyncFromAlarms,
    addManualPerson: mockAddManualPerson,
    addPersonFromRecipient: mockAddPersonFromRecipient,
    assignVehicle: mockAssignVehicle,
    updateFunktion: mockUpdateFunktion,
    removeAssignment: mockRemoveAssignment,
  }),
}));
```

**(b)** Die `mockAssignments` (Zeilen ~24-41) um eine explizit ergänzte, abgelehnte Person erweitern und `source` setzen:

```ts
const mockAssignments: CrewAssignment[] = [
  {
    id: 'a1',
    recipientId: 'r1',
    name: 'Max Mustermann',
    vehicleId: null,
    vehicleName: '',
    funktion: 'Feuerwehrmann',
    source: 'alarm',
  },
  {
    id: 'a2',
    recipientId: 'r2',
    name: 'Anna Beispiel',
    vehicleId: 'v1',
    vehicleName: 'KDTFA',
    funktion: 'Maschinist',
    source: 'alarm',
  },
  {
    id: 'a3',
    recipientId: 'r3',
    name: 'Fritz Nein',
    vehicleId: null,
    vehicleName: '',
    funktion: 'Feuerwehrmann',
    source: 'manual', // explizit ergänzt, obwohl im Alarm 'no'
  },
];
```

**(c)** Alle Verwendungen von `alarm={mockAlarm}` auf `alarms={[mockAlarm]}` umstellen und die bestehenden Tests anpassen. Konkret die `it(...)`-Blöcke (Zeilen ~176-206) ersetzen durch:

```ts
describe('CrewAssignmentBoard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseMediaQuery.mockReturnValue(false);
  });

  it('renders Besatzung heading', () => {
    render(<CrewAssignmentBoard alarms={[mockAlarm]} />);
    expect(screen.getByText('Besatzung')).toBeInTheDocument();
  });

  it('calls syncFromAlarms on mount with the alarm list', () => {
    render(<CrewAssignmentBoard alarms={[mockAlarm]} />);
    expect(mockSyncFromAlarms).toHaveBeenCalledWith([mockAlarm]);
  });

  it('renders confirmed person names in table', () => {
    render(<CrewAssignmentBoard alarms={[mockAlarm]} />);
    expect(screen.getByText('Max Mustermann')).toBeInTheDocument();
    expect(screen.getByText('Anna Beispiel')).toBeInTheDocument();
  });

  it('keeps a manually added declined person visible', () => {
    // Fritz Nein has participation 'no' in the alarm but source 'manual'
    render(<CrewAssignmentBoard alarms={[mockAlarm]} />);
    expect(screen.getByText('Fritz Nein')).toBeInTheDocument();
  });

  it('hides an alarm-source person who is no longer confirmed', () => {
    // Alarm where r2 withdrew (no); r2's crew entry is source 'alarm'
    const withdrawn: BlaulichtSmsAlarm = {
      ...mockAlarm,
      recipients: mockAlarm.recipients.map((r) =>
        r.id === 'r2' ? { ...r, participation: 'no' as const } : r,
      ),
    };
    render(<CrewAssignmentBoard alarms={[withdrawn]} />);
    expect(screen.queryByText('Anna Beispiel')).not.toBeInTheDocument();
    // Max (r1, still yes) and Fritz (manual) remain
    expect(screen.getByText('Max Mustermann')).toBeInTheDocument();
    expect(screen.getByText('Fritz Nein')).toBeInTheDocument();
  });

  it('renders Kanban columns on desktop with vehicle names', () => {
    mockUseMediaQuery.mockReturnValue(false);
    render(<CrewAssignmentBoard alarms={[mockAlarm]} />);
    expect(screen.getByText('Verfügbar')).toBeInTheDocument();
    expect(screen.getAllByText('KDTFA').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('TLFA 4000').length).toBeGreaterThanOrEqual(1);
  });

  it('renders table with headers on mobile', () => {
    mockUseMediaQuery.mockReturnValue(true);
    render(<CrewAssignmentBoard alarms={[mockAlarm]} />);
    expect(screen.getByText('Name')).toBeInTheDocument();
    expect(screen.getByText('Funktion')).toBeInTheDocument();
    expect(screen.getByText('Fahrzeug')).toBeInTheDocument();
  });

  it('offers non-yes recipients as autocomplete options', async () => {
    const user = (await import('@testing-library/user-event')).default.setup();
    render(<CrewAssignmentBoard alarms={[mockAlarm]} />);
    // Open the "additional person" autocomplete
    const input = screen.getByLabelText('Weitere Person hinzufügen');
    await user.click(input);
    // r3 (Fritz Nein, participation 'no') is a non-yes recipient option.
    // It appears in the listbox (getAllByText covers table + option).
    expect(screen.getAllByText(/Fritz Nein/).length).toBeGreaterThanOrEqual(1);
    // r1/r2 are 'yes' → NOT offered as options (only shown in the crew table)
  });
});
```

> Falls `@testing-library/user-event` nicht installiert ist, stattdessen `fireEvent` aus `@testing-library/react` verwenden: `fireEvent.mouseDown(input)`.

- [ ] **Step 4: Test laufen lassen, Fehlschlag bestätigen**

Run: `NO_COLOR=1 npx vitest run src/components/pages/CrewAssignmentBoard.test.tsx`
Expected: FAIL — Prop `alarm` existiert nicht mehr / `syncFromAlarms` nicht aufgerufen / Autocomplete-Label nicht gefunden.

### 4c — Implementierung

- [ ] **Step 5: Props und Sync auf Multi-Alarm umstellen**

In `src/components/pages/CrewAssignmentBoard.tsx`:

Props ändern (Zeilen ~60-62):

```ts
export interface CrewAssignmentBoardProps {
  alarms?: BlaulichtSmsAlarm[] | null;
}
```

Komponenten-Signatur (Zeile ~190):

```ts
export default function CrewAssignmentBoard({
  alarms,
}: CrewAssignmentBoardProps) {
```

Hook-Destrukturierung (Zeilen ~194-201) anpassen:

```ts
  const {
    crewAssignments,
    syncFromAlarms,
    addManualPerson,
    addPersonFromRecipient,
    assignVehicle,
    updateFunktion,
    removeAssignment,
  } = useCrewAssignments();
```

Sync-Effekt (Zeilen ~238-245) ersetzen:

```ts
  // Only sync once per alarm-set to prevent duplicate creation.
  // The key is a stable join of all alarm ids so that adding/removing an
  // alarm re-triggers the sync.
  const alarmKey = useMemo(
    () =>
      (alarms ?? [])
        .map((a) => a.alarmId)
        .sort()
        .join(','),
    [alarms],
  );
  const syncedKeyRef = useRef<string | null>(null);
  useEffect(() => {
    if (!alarms || alarms.length === 0) return;
    if (syncedKeyRef.current === alarmKey) return;
    syncedKeyRef.current = alarmKey;
    syncFromAlarms(alarms);
  }, [alarms, alarmKey, syncFromAlarms]);
```

- [ ] **Step 6: Sichtbarkeitsfilter (`confirmedIds` + `validAssignments`) umstellen**

`confirmedIds` (Zeilen ~249-259) ersetzen — Vereinigung über alle Alarme:

```ts
  // Union of confirmed (yes) recipient ids across ALL alarms.
  // null when no alarms are available → then all crew entries are shown.
  const confirmedIds = useMemo(() => {
    if (!alarms || alarms.length === 0) return null;
    const ids = new Set<string>();
    for (const alarm of alarms) {
      for (const r of alarm.recipients) {
        if (r.participation === 'yes') ids.add(r.id);
      }
    }
    return ids;
  }, [alarms]);
```

`validAssignments` (Zeilen ~263-273) ersetzen — Herkunft entscheidet:

```ts
  // Show an entry when it was explicitly added (source 'manual') OR when its
  // recipient is currently in the union of confirmed ids. Legacy entries
  // without a source are treated as 'alarm'. Dedupe by recipientId.
  const validAssignments = useMemo(() => {
    const seen = new Set<string>();
    return crewAssignments.filter((a) => {
      const isManual = a.source === 'manual';
      if (!isManual && confirmedIds && !confirmedIds.has(a.recipientId))
        return false;
      if (seen.has(a.recipientId)) return false;
      seen.add(a.recipientId);
      return true;
    });
  }, [crewAssignments, confirmedIds]);
```

- [ ] **Step 7: Entfernen-Button auf `source === 'manual'` umstellen**

In `renderRows` (Zeilen ~329-333) die `onRemove`-Bedingung ersetzen:

```ts
        onRemove={
          a.source === 'manual' && a.id
            ? () => removeAssignment(a.id!)
            : undefined
        }
```

Und in beiden `CrewVehicleColumn`-Verwendungen (Desktop-Zweig) — die Spalte bekommt `onRemove={removeAssignment}` bereits; die Spalten-Komponente entscheidet selbst per Zeile. Prüfen, ob `CrewVehicleColumn` intern denselben `manual-`-Präfix-Check nutzt. Falls ja → **Step 7b**.

- [ ] **Step 7b: `CrewVehicleColumn` auf `source` prüfen (falls nötig)**

Run: `LC_ALL=C /usr/bin/grep -n "manual-\|recipientId.startsWith\|onRemove\|source" src/components/pages/CrewVehicleColumn.tsx`

Falls dort `recipientId.startsWith('manual-')` verwendet wird, dieselbe Bedingung auf `assignment.source === 'manual'` umstellen. (Wenn die Datei den Remove-Button nur durchreicht und die Entscheidung an den Aufrufer delegiert, keine Änderung nötig.)

- [ ] **Step 8: Autocomplete für zusätzliche Personen einbauen**

Optionen berechnen — nach `existingVehicleNames` (~Zeile 209) einfügen:

```ts
  // Recipients across all alarms who did NOT confirm (no / unknown / pending),
  // deduped by id, excluding anyone already in the crew list.
  const additionalPersonOptions = useMemo(() => {
    const alreadyAdded = new Set(crewAssignments.map((a) => a.recipientId));
    const byId = new Map<
      string,
      { id: string; name: string; participation: string }
    >();
    for (const alarm of alarms ?? []) {
      for (const r of alarm.recipients) {
        if (r.participation === 'yes') continue;
        if (alreadyAdded.has(r.id)) continue;
        if (!byId.has(r.id)) {
          byId.set(r.id, {
            id: r.id,
            name: r.name,
            participation: r.participation,
          });
        }
      }
    }
    return [...byId.values()];
  }, [alarms, crewAssignments]);

  const participationLabel = useCallback(
    (participation: string) => {
      switch (participation) {
        case 'no':
          return t('statusDeclined');
        case 'pending':
          return t('statusPending');
        default:
          return t('statusNoAnswer');
      }
    },
    [t],
  );
```

Importe oben ergänzen: `Autocomplete` aus `@mui/material` (zur bestehenden Sammelimport-Liste hinzufügen).

Das bestehende „Person hinzufügen"-`TextField` + `IconButton` (Zeilen ~340-367) ersetzen durch ein `Autocomplete`:

```tsx
        <Autocomplete
          freeSolo
          size="small"
          sx={{ ml: 'auto', minWidth: 260 }}
          options={additionalPersonOptions}
          getOptionLabel={(option) =>
            typeof option === 'string' ? option : option.name
          }
          renderOption={(props, option) => (
            <li {...props} key={option.id}>
              {option.name} ({participationLabel(option.participation)})
            </li>
          )}
          value={null}
          inputValue={newPersonName}
          onInputChange={(_e, value) => setNewPersonName(value)}
          onChange={(_e, value) => {
            if (value && typeof value !== 'string') {
              addPersonFromRecipient(value);
              setNewPersonName('');
            }
          }}
          renderInput={(params) => (
            <TextField
              {...params}
              label={t('additionalPersons')}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && newPersonName.trim()) {
                  // freeSolo manual entry: only add when it isn't an option
                  const isOption = additionalPersonOptions.some(
                    (o) => o.name === newPersonName.trim(),
                  );
                  if (!isOption) {
                    addManualPerson(newPersonName);
                    setNewPersonName('');
                  }
                }
              }}
            />
          )}
        />
```

> `AddIcon`, `Tooltip`-Wrapper des alten Buttons und der zugehörige `IconButton` entfallen. Ungenutzte Importe (`AddIcon`, ggf. `Tooltip`) entfernen, damit ESLint sauber bleibt — `Tooltip` nur entfernen, wenn nirgends sonst verwendet (`LC_ALL=C /usr/bin/grep -n "Tooltip" src/components/pages/CrewAssignmentBoard.tsx`).

- [ ] **Step 9: Test laufen lassen, Erfolg bestätigen**

Run: `NO_COLOR=1 npx vitest run src/components/pages/CrewAssignmentBoard.test.tsx`
Expected: PASS.

- [ ] **Step 10: TypeScript- und Lint-Check**

Run: `npx tsc --noEmit && npx eslint src/components/pages/CrewAssignmentBoard.tsx`
Expected: keine Fehler/Warnings.

- [ ] **Step 11: Commit**

```bash
git add src/components/pages/CrewAssignmentBoard.tsx src/components/pages/CrewAssignmentBoard.test.tsx src/components/pages/CrewVehicleColumn.tsx messages/de.json messages/en.json
git commit -m "feat(crew): Multi-Alarm-Besatzung mit Personen-Autocomplete"
```

---

## Task 5: EinsatzDialog — Multi-Select für Alarme

**Files:**
- Modify: `src/components/FirecallItems/EinsatzDialog.tsx`

Kein isolierter Unit-Test (Dialog mit vielen Firebase-/Server-Action-Abhängigkeiten); Verifikation über `tsc`, Lint und manuelles Testen. Die Kernlogik (`applyAlarm`, `resetEinsatzToManual`) ist bereits durch Task 3 abgedeckt.

- [ ] **Step 1: State auf Array umstellen**

In `src/components/FirecallItems/EinsatzDialog.tsx`:

`selectedAlarmId` (Zeilen ~73-75) ersetzen:

```ts
  const [selectedAlarmIds, setSelectedAlarmIds] = useState<string[]>(
    einsatzDefault?.blaulichtSmsAlarmIds ??
      (einsatzDefault?.blaulichtSmsAlarmId
        ? [einsatzDefault.blaulichtSmsAlarmId]
        : []),
  );
```

- [ ] **Step 2: Auto-Anwendung des ersten Alarms bei neuem Einsatz anpassen**

Im `fetchAlarms`-Effekt (Zeilen ~149-156) den `isNewEinsatz`-Zweig anpassen — beim Autoselect den obersten Alarm in die Liste setzen:

```ts
        if (isNewEinsatz) {
          if (sorted.length > 0) {
            setSelectedAlarmIds([sorted[0].alarmId]);
            applyAlarm(sorted[0]);
          } else {
            clearStaleAlarmData();
          }
        }
```

Und `clearStaleAlarmData` (Zeilen ~127-133) `setSelectedAlarmId('')` → `setSelectedAlarmIds([])`.

- [ ] **Step 3: `handleAlarmChange` für Multi-Select umschreiben**

`handleAlarmChange` (Zeilen ~167-187) ersetzen:

```ts
  const handleAlarmChange = useCallback(
    (event: SelectChangeEvent<string[]>) => {
      const value = event.target.value;
      const ids = typeof value === 'string' ? value.split(',') : value;
      setSelectedAlarmIds(ids);

      if (ids.length === 0) {
        if (isNewEinsatz) {
          setEinsatz((prev) => resetEinsatzToManual(prev));
        } else {
          setEinsatz((prev) => ({
            ...prev,
            blaulichtSmsAlarmId: undefined,
            blaulichtSmsAlarmIds: [],
          }));
        }
        return;
      }

      // First selected alarm fills the Einsatz fields (new Einsatz only).
      if (isNewEinsatz) {
        const primary = alarms.find((a) => a.alarmId === ids[0]);
        if (primary) applyAlarm(primary);
      }
      setEinsatz((prev) => ({
        ...prev,
        blaulichtSmsAlarmId: ids[0],
        blaulichtSmsAlarmIds: ids,
      }));
    },
    [alarms, applyAlarm, isNewEinsatz],
  );
```

- [ ] **Step 4: `applyAlarm` um `blaulichtSmsAlarmIds` ergänzen**

In `applyAlarm` (Zeilen ~84-91) das gesetzte Objekt so erweitern, dass auch das Array gesetzt wird:

```ts
    setEinsatz((prev) => ({
      ...prev,
      name,
      date: new Date(alarm.alarmDate).toISOString(),
      description: alarm.alarmText,
      blaulichtSmsAlarmId: alarm.alarmId,
      blaulichtSmsAlarmIds: [alarm.alarmId],
      ...(coords ? { lat: coords.lat, lng: coords.lon } : {}),
    }));
```

> Hinweis: `handleAlarmChange` überschreibt `blaulichtSmsAlarmIds` anschließend mit der vollständigen Auswahl; `applyAlarm` setzt nur den Primär-Alarm für den Fall des Auto-Selects.

- [ ] **Step 5: Select auf `multiple` umstellen**

Den Alarm-`Select`-Block (Zeilen ~269-298) ersetzen. `Chip` und `Box` sind bereits importiert bzw. `Box` ist importiert — `Chip` aus `@mui/material` importieren:

```tsx
        {!alarmsLoading && alarms.length > 0 && (
          <FormControl fullWidth variant="standard" sx={{ mb: 1 }}>
            <InputLabel id="alarm-select-label">
              {t('firecall.alarmSelect')}
            </InputLabel>
            <Select
              labelId="alarm-select-label"
              id="alarm-select"
              multiple
              value={selectedAlarmIds}
              label={t('firecall.alarmSelect')}
              onChange={handleAlarmChange}
              renderValue={(selected) => (
                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                  {(selected as string[]).map((id) => {
                    const a = alarms.find((x) => x.alarmId === id);
                    return (
                      <Chip
                        key={id}
                        size="small"
                        label={a ? a.alarmText : id}
                      />
                    );
                  })}
                </Box>
              )}
            >
              {alarms.map((alarm) => (
                <MenuItem key={alarm.alarmId} value={alarm.alarmId}>
                  {alarm.alarmText} (
                  {format.dateTime(new Date(alarm.alarmDate), {
                    dateStyle: 'short',
                    timeStyle: 'short',
                  })}
                  )
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        )}
```

> Der bisherige leere `MenuItem` (Manuelle Eingabe / keine Zuordnung) entfällt beim Multi-Select — Leeren erfolgt durch Abwählen aller Einträge. `Checkbox`/`ListItemText` sind optional; die einfache `MenuItem`-Variante zeigt Auswahl über die Chips.

- [ ] **Step 6: Import ergänzen und ungenutzte prüfen**

`Chip` zum `@mui/material/Chip`-Import hinzufügen (Projekt nutzt Einzelimporte, siehe `import Box from '@mui/material/Box';`):

```ts
import Chip from '@mui/material/Chip';
```

- [ ] **Step 7: TypeScript- und Lint-Check**

Run: `npx tsc --noEmit && npx eslint src/components/FirecallItems/EinsatzDialog.tsx`
Expected: keine Fehler/Warnings.

- [ ] **Step 8: Commit**

```bash
git add src/components/FirecallItems/EinsatzDialog.tsx
git commit -m "feat(einsatz): Mehrfachauswahl von Alarmen im Einsatz-Dialog"
```

---

## Task 6: EinsatzDetails — mehrere Alarme laden und anzeigen

**Files:**
- Modify: `src/components/pages/EinsatzDetails.tsx`

Keine isolierten Unit-Tests (datenintensive Seiten-Komponente); Verifikation über `tsc`/Lint/manuelles Testen.

- [ ] **Step 1: Import des Helpers ergänzen**

In `src/components/pages/EinsatzDetails.tsx` den Import aus `../firebase/firestore` (Zeilen ~36-39) um `firecallAlarmIds` erweitern:

```ts
import {
  Firecall,
  FIRECALL_COLLECTION_ID,
  firecallAlarmIds,
} from '../firebase/firestore';
```

- [ ] **Step 2: State auf Array umstellen**

`alarm`-State (Zeilen ~70-72) ersetzen:

```ts
  const [alarms, setAlarms] = useState<BlaulichtSmsAlarm[] | undefined>(
    undefined,
  );
```

- [ ] **Step 3: Lade-Effekt auf mehrere Alarme umstellen**

Den `blaulichtSmsAlarmId`-Effekt (Zeilen ~87-108) ersetzen:

```ts
  const alarmIdsKey = firecall ? firecallAlarmIds(firecall).join(',') : '';
  const firecallGroup = firecall?.group;

  useEffect(() => {
    if (!alarmIdsKey || !firecallGroup) {
      setAlarms(undefined);
      return;
    }
    const ids = alarmIdsKey.split(',');
    let cancelled = false;
    (async () => {
      try {
        const results = await Promise.all(
          ids.map((id) => getBlaulichtSmsAlarmById(firecallGroup, id)),
        );
        if (!cancelled) {
          setAlarms(
            results.filter((a): a is BlaulichtSmsAlarm => a !== null),
          );
        }
      } catch (err) {
        console.error('Failed to load BlaulichtSMS alarms:', err);
        if (!cancelled) setAlarms([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [alarmIdsKey, firecallGroup]);
```

- [ ] **Step 4: BlaulichtSMS-Anzeige auf mehrere Cards umstellen**

Den BlaulichtSMS-Details-Block (Zeilen ~337-355) ersetzen:

```tsx
      {/* BlaulichtSMS Details */}
      {firecallAlarmIds(firecall).length > 0 && (
        <Box sx={{ mb: 3 }}>
          <Typography variant="h5" gutterBottom>
            {t('blaulichtSmsTitle')}
          </Typography>
          {alarms === undefined ? (
            <CircularProgress size={24} />
          ) : alarms.length > 0 ? (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {alarms.map((a) => (
                <AlarmCard
                  key={a.alarmId}
                  alarm={a}
                  defaultExpandRecipients={false}
                />
              ))}
            </Box>
          ) : (
            <Typography color="text.secondary">
              {t('blaulichtSmsLoadError', {
                id: firecallAlarmIds(firecall).join(', '),
              })}
            </Typography>
          )}
        </Box>
      )}
```

- [ ] **Step 5: `CrewAssignmentBoard`-Aufruf anpassen**

Zeile ~415 `alarm={alarm}` → `alarms={alarms}`:

```tsx
      <Box sx={{ mt: 3 }}>
        <CrewAssignmentBoard alarms={alarms} />
      </Box>
```

- [ ] **Step 6: TypeScript- und Lint-Check**

Run: `npx tsc --noEmit && npx eslint src/components/pages/EinsatzDetails.tsx`
Expected: keine Fehler/Warnings.

- [ ] **Step 7: Commit**

```bash
git add src/components/pages/EinsatzDetails.tsx
git commit -m "feat(einsatz): mehrere Alarme in den Einsatz-Details laden und anzeigen"
```

---

## Task 7: `getFirecallsByAlarmIds` — auch Nachalarme matchen

**Files:**
- Modify: `src/app/blaulicht-sms/actions.ts`

Keine isolierten Unit-Tests (Server-Action mit Firebase-Admin); Verifikation über `tsc`/Lint/Build.

- [ ] **Step 1: Import des Helpers ergänzen**

In `src/app/blaulicht-sms/actions.ts` oben ergänzen:

```ts
import { firecallAlarmIds } from '../../components/firebase/firestore';
```

> `firecallAlarmIds` nimmt ein `Firecall`; die Admin-`doc.data()` liefert `any` — für den Aufruf `firecallAlarmIds(data as any)` bzw. inline lesen (siehe Step 2). Um keinen Client-Code in eine Server-Datei zu ziehen, alternativ eine lokale Inline-Variante nutzen — siehe Step 2b, falls der Import Server/Client-Grenzen verletzt.

- [ ] **Step 2: Query um `array-contains-any` erweitern und Mapping über alle Alarm-IDs**

Die Schleife in `getFirecallsByAlarmIds` (Zeilen ~185-208) ersetzen:

```ts
  for (const chunk of chunks) {
    const [scalarSnap, arraySnap] = await Promise.all([
      firestore
        .collection('call')
        .where('blaulichtSmsAlarmId', 'in', chunk)
        .where('deleted', '!=', true)
        .get(),
      firestore
        .collection('call')
        .where('blaulichtSmsAlarmIds', 'array-contains-any', chunk)
        .where('deleted', '!=', true)
        .get(),
    ]);

    const seenDocIds = new Set<string>();
    for (const doc of [...scalarSnap.docs, ...arraySnap.docs]) {
      if (seenDocIds.has(doc.id)) continue;
      seenDocIds.add(doc.id);

      const data = doc.data();
      // Only expose firecalls the user is authorized for; otherwise this leaks
      // ids/names of firecalls from other groups.
      if (
        !isAuthorizedForFirecall(
          data.group,
          doc.id,
          userGroups,
          userFirecall,
          isAdmin
        )
      ) {
        continue;
      }

      // Map every alarm id of this firecall that was part of the request chunk
      // so both primary and Nachalarm ids get badged.
      const fcAlarmIds =
        (data.blaulichtSmsAlarmIds as string[] | undefined) ??
        (data.blaulichtSmsAlarmId ? [data.blaulichtSmsAlarmId] : []);
      for (const aid of fcAlarmIds) {
        if (chunk.includes(aid)) {
          results[aid] = { id: doc.id, name: data.name };
        }
      }
    }
  }
```

> Diese Inline-Lesart vermeidet den Import von Client-Code in die Server-Action (Step 1 kann dann entfallen). **Step 1 nur ausführen, wenn der Import ohne `'use client'`-Konflikt möglich ist** — `firestore.ts` enthält kein `'use client'`, daher ist der Import grundsätzlich zulässig; die Inline-Variante ist dennoch robuster gegen versehentliche Client-Kopplung. Entscheide sicherheitshalber für die Inline-Variante und lasse Step 1 weg.

- [ ] **Step 2b: Firestore-Index prüfen**

`array-contains-any` kombiniert mit dem `!=`-Filter auf `deleted` benötigt evtl. einen zusammengesetzten Index. Nach dem ersten Aufruf im Log/Fehlertext auf einen Index-Link achten. Falls nötig, Index in `firebase/` (Firestore-Indexdefinition) ergänzen. Für die Plan-Verifikation genügt `tsc`/Build; den Index bei manuellem Test in Dev nachziehen.

- [ ] **Step 3: TypeScript- und Lint-Check**

Run: `npx tsc --noEmit && npx eslint src/app/blaulicht-sms/actions.ts`
Expected: keine Fehler/Warnings.

- [ ] **Step 4: Commit**

```bash
git add src/app/blaulicht-sms/actions.ts
git commit -m "feat(blaulicht-sms): Firecall-Zuordnung über alle Alarm-IDs auflösen"
```

---

## Task 8: Gesamtverifikation

- [ ] **Step 1: Alle Tests**

Run: `NO_COLOR=1 npx vitest run`
Expected: alle Tests grün.

- [ ] **Step 2: TypeScript**

Run: `npx tsc --noEmit`
Expected: keine Fehler.

- [ ] **Step 3: Lint**

Run: `npx eslint`
Expected: keine Fehler/Warnings.

- [ ] **Step 4: Production-Build**

Run: `npx next build --webpack`
Expected: erfolgreicher Build.

- [ ] **Step 5: Manuelles Testen (Dev)**

Run: `npm run dev` und prüfen:
1. Neuer Einsatz aus BlaulichtSMS-Seite: mehrere Alarme im Dialog auswählbar (Chips); erster Alarm befüllt Name/Ort.
2. Einsatz-Details: mehrere `AlarmCard`s werden angezeigt.
3. Besatzung: Zusagen aus allen Alarmen kombiniert; abgelehnte/nicht geantwortete Personen über Autocomplete hinzufügbar; Freitext-Person hinzufügbar; manuell/ergänzte Personen entfernbar.
4. Bestehender Einsatz mit einzelnem `blaulichtSmsAlarmId` funktioniert unverändert (Alarm wird geladen, Zusagen erscheinen).

- [ ] **Step 6: PR-Vorbereitung**

Wenn alles grün: Branch pushen und PR gemäß CLAUDE.md-Konventionen erstellen (Titel Conventional Commit, Beschreibung Deutsch, Label `feature`).
```
