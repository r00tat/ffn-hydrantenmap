# Besatzungszuordnung Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Enable drag-and-drop assignment of BlaulichtSMS-confirmed personnel to vehicles on the Einsatz detail page, with function role selection.

**Architecture:** New Firestore subcollection `call/{firecallId}/crew` stores person-vehicle assignments. A `useCrewAssignments` hook provides realtime data. A responsive `CrewAssignment` component renders Kanban columns (desktop) or accordion sections (mobile). `@dnd-kit/core` (already installed) handles drag-and-drop.

**Tech Stack:** React 19, MUI, @dnd-kit/core (v6.3.1, already installed), Firebase Firestore, TypeScript

---

### Task 1: Add CrewAssignment type and Firestore collection constant

**Files:**
- Modify: `src/components/firebase/firestore.ts:19` (add collection constant after `FIRECALL_AUDITLOG_COLLECTION_ID`)

**Step 1: Add the type and constant to firestore.ts**

After the existing collection constants (line 19), add:

```typescript
export const FIRECALL_CREW_COLLECTION_ID = 'crew';
```

After the existing type definitions (after Firecall interface, around line 279), add:

```typescript
export type CrewFunktion =
  | 'Feuerwehrmann'
  | 'Maschinist'
  | 'Gruppenkommandant'
  | 'Atemschutzträger'
  | 'Zugskommandant'
  | 'Einsatzleiter';

export const CREW_FUNKTIONEN: CrewFunktion[] = [
  'Feuerwehrmann',
  'Maschinist',
  'Gruppenkommandant',
  'Atemschutzträger',
  'Zugskommandant',
  'Einsatzleiter',
];

export interface CrewAssignment {
  id?: string;
  recipientId: string;
  name: string;
  vehicleId: string | null;
  vehicleName: string;
  funktion: CrewFunktion;
  updatedAt?: string;
  updatedBy?: string;
}
```

**Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: No new errors

**Step 3: Commit**

```
feat: add CrewAssignment type and crew collection constant
```

---

### Task 2: Create useCrewAssignments hook

**Files:**
- Create: `src/hooks/useCrewAssignments.ts`
- Create: `src/hooks/useCrewAssignments.test.ts`

**Step 1: Write tests for the hook**

Create `src/hooks/useCrewAssignments.test.ts`. Test that:
- Hook returns `crewAssignments` array and CRUD functions
- `syncFromAlarm` creates crew docs for new recipients and preserves existing ones
- `updateAssignment` calls Firestore updateDoc
- `assignVehicle` updates vehicleId and vehicleName

Use vitest mocks for Firebase.

**Step 2: Run tests to verify they fail**

Run: `NO_COLOR=1 npx vitest run src/hooks/useCrewAssignments.test.ts`
Expected: FAIL (module not found)

**Step 3: Implement the hook**

Create `src/hooks/useCrewAssignments.ts`:

```typescript
'use client';

import { useCallback, useMemo } from 'react';
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  updateDoc,
} from 'firebase/firestore';
import { firestore } from '../components/firebase/firebase';
import {
  CrewAssignment,
  CrewFunktion,
  FIRECALL_COLLECTION_ID,
  FIRECALL_CREW_COLLECTION_ID,
} from '../components/firebase/firestore';
import useFirebaseCollection from './useFirebaseCollection';
import { useFirecallId } from './useFirecall';
import useFirebaseLogin from './useFirebaseLogin';

export default function useCrewAssignments() {
  const firecallId = useFirecallId();
  const { email } = useFirebaseLogin();

  const crewAssignments = useFirebaseCollection<CrewAssignment>({
    collectionName: FIRECALL_COLLECTION_ID,
    pathSegments: [firecallId, FIRECALL_CREW_COLLECTION_ID],
  });

  const crewCollectionRef = useMemo(
    () =>
      collection(
        firestore,
        FIRECALL_COLLECTION_ID,
        firecallId,
        FIRECALL_CREW_COLLECTION_ID
      ),
    [firecallId]
  );

  const syncFromAlarm = useCallback(
    async (
      recipients: { id: string; name: string; participation: string }[]
    ) => {
      const confirmed = recipients.filter((r) => r.participation === 'yes');
      const existingIds = new Set(crewAssignments.map((c) => c.recipientId));

      const newRecipients = confirmed.filter(
        (r) => !existingIds.has(r.id)
      );

      await Promise.all(
        newRecipients.map((r) =>
          addDoc(crewCollectionRef, {
            recipientId: r.id,
            name: r.name,
            vehicleId: null,
            vehicleName: '',
            funktion: 'Feuerwehrmann' as CrewFunktion,
            updatedAt: new Date().toISOString(),
            updatedBy: email,
          })
        )
      );
    },
    [crewAssignments, crewCollectionRef, email]
  );

  const updateAssignment = useCallback(
    async (assignmentId: string, data: Partial<CrewAssignment>) => {
      const docRef = doc(
        firestore,
        FIRECALL_COLLECTION_ID,
        firecallId,
        FIRECALL_CREW_COLLECTION_ID,
        assignmentId
      );
      await updateDoc(docRef, {
        ...data,
        updatedAt: new Date().toISOString(),
        updatedBy: email,
      });
    },
    [firecallId, email]
  );

  const assignVehicle = useCallback(
    async (
      assignmentId: string,
      vehicleId: string | null,
      vehicleName: string
    ) => {
      await updateAssignment(assignmentId, { vehicleId, vehicleName });
    },
    [updateAssignment]
  );

  const updateFunktion = useCallback(
    async (assignmentId: string, funktion: CrewFunktion) => {
      await updateAssignment(assignmentId, { funktion });
    },
    [updateAssignment]
  );

  const removeAssignment = useCallback(
    async (assignmentId: string) => {
      const docRef = doc(
        firestore,
        FIRECALL_COLLECTION_ID,
        firecallId,
        FIRECALL_CREW_COLLECTION_ID,
        assignmentId
      );
      await deleteDoc(docRef);
    },
    [firecallId]
  );

  return {
    crewAssignments,
    syncFromAlarm,
    assignVehicle,
    updateFunktion,
    updateAssignment,
    removeAssignment,
  };
}
```

**Step 4: Run tests to verify they pass**

Run: `NO_COLOR=1 npx vitest run src/hooks/useCrewAssignments.test.ts`
Expected: PASS

**Step 5: Commit**

```
feat: add useCrewAssignments hook for crew Firestore CRUD
```

---

### Task 3: Create CrewPersonCard component

**Files:**
- Create: `src/components/pages/CrewPersonCard.tsx`
- Create: `src/components/pages/CrewPersonCard.test.tsx`

**Step 1: Write tests**

Test that:
- Renders person name
- Renders Funktion select with all 6 options
- Renders Fahrzeug select with available vehicles
- Calls `onFunktionChange` when function select changes
- Calls `onVehicleChange` when vehicle select changes
- Is draggable (has `useDraggable` from @dnd-kit)

**Step 2: Run tests to verify they fail**

Run: `NO_COLOR=1 npx vitest run src/components/pages/CrewPersonCard.test.tsx`
Expected: FAIL

**Step 3: Implement the component**

Create `src/components/pages/CrewPersonCard.tsx`:

A Card displaying:
- Person name (Typography)
- Funktion select (MUI Select, compact size="small")
- Fahrzeug select (MUI Select, only shown on mobile or as fallback; options: vehicles + "-- Nicht zugeordnet --")
- Wrapped in `useDraggable` from `@dnd-kit/core`

Props:
```typescript
interface CrewPersonCardProps {
  assignment: CrewAssignment;
  vehicles: Fzg[];
  onFunktionChange: (funktion: CrewFunktion) => void;
  onVehicleChange: (vehicleId: string | null, vehicleName: string) => void;
  showVehicleSelect?: boolean; // true on mobile, false in kanban columns
}
```

**Step 4: Run tests**

Run: `NO_COLOR=1 npx vitest run src/components/pages/CrewPersonCard.test.tsx`
Expected: PASS

**Step 5: Commit**

```
feat: add CrewPersonCard component with drag support and selects
```

---

### Task 4: Create CrewVehicleColumn component (desktop Kanban column)

**Files:**
- Create: `src/components/pages/CrewVehicleColumn.tsx`
- Create: `src/components/pages/CrewVehicleColumn.test.tsx`

**Step 1: Write tests**

Test that:
- Renders vehicle name as column header
- Renders crew count in header
- Renders assigned CrewPersonCards
- Has `useDroppable` from @dnd-kit for drop target
- Shows visual feedback on dragover (highlight border)

**Step 2: Run tests to verify they fail**

Run: `NO_COLOR=1 npx vitest run src/components/pages/CrewVehicleColumn.test.tsx`
Expected: FAIL

**Step 3: Implement the component**

Create `src/components/pages/CrewVehicleColumn.tsx`:

A column (Box with border) containing:
- Header: vehicle name + crew count badge
- List of `CrewPersonCard` components for assigned crew
- Drop target via `useDroppable({ id: vehicleId || 'unassigned' })`

Props:
```typescript
interface CrewVehicleColumnProps {
  vehicleId: string | null;    // null = "Verfügbar" column
  vehicleName: string;
  assignments: CrewAssignment[];
  vehicles: Fzg[];
  onFunktionChange: (assignmentId: string, funktion: CrewFunktion) => void;
  onVehicleChange: (assignmentId: string, vehicleId: string | null, vehicleName: string) => void;
}
```

**Step 4: Run tests**

Run: `NO_COLOR=1 npx vitest run src/components/pages/CrewVehicleColumn.test.tsx`
Expected: PASS

**Step 5: Commit**

```
feat: add CrewVehicleColumn component with drop target
```

---

### Task 5: Create CrewAssignmentBoard component (main orchestrator)

**Files:**
- Create: `src/components/pages/CrewAssignmentBoard.tsx`
- Create: `src/components/pages/CrewAssignmentBoard.test.tsx`

**Step 1: Write tests**

Test that:
- Renders "Besatzung" heading
- On desktop: renders Kanban columns (one "Verfügbar" + one per vehicle)
- On mobile: renders accordion sections
- DndContext handles drag end: calls assignVehicle with correct params
- syncFromAlarm is called when alarm data changes and there are new recipients
- Shows nothing when alarm has no confirmed recipients

**Step 2: Run tests to verify they fail**

Run: `NO_COLOR=1 npx vitest run src/components/pages/CrewAssignmentBoard.test.tsx`
Expected: FAIL

**Step 3: Implement the component**

Create `src/components/pages/CrewAssignmentBoard.tsx`:

```typescript
interface CrewAssignmentBoardProps {
  alarm: BlaulichtSmsAlarm;
}
```

Structure:
1. Uses `useCrewAssignments()` hook
2. Uses `useVehicles()` for vehicle list
3. Uses `useTheme()` + `useMediaQuery(theme.breakpoints.down('md'))` for responsive
4. Calls `syncFromAlarm(alarm.recipients)` in useEffect when alarm changes
5. Wraps content in `DndContext` from `@dnd-kit/core`
6. `onDragEnd` handler: extracts target vehicleId from `over.id`, calls `assignVehicle`

Desktop layout:
```tsx
<Box sx={{ display: 'flex', gap: 2, overflowX: 'auto', pb: 1 }}>
  <CrewVehicleColumn vehicleId={null} vehicleName="Verfügbar" ... />
  {vehicles.map(v => (
    <CrewVehicleColumn key={v.id} vehicleId={v.id!} vehicleName={v.name} ... />
  ))}
</Box>
```

Mobile layout:
```tsx
<Box>
  <Accordion defaultExpanded>
    <AccordionSummary>Verfügbar ({unassigned.length})</AccordionSummary>
    <AccordionDetails>
      {unassigned.map(a => <CrewPersonCard showVehicleSelect ... />)}
    </AccordionDetails>
  </Accordion>
  {vehicles.map(v => (
    <Accordion key={v.id}>
      <AccordionSummary>{v.name} ({assigned.length})</AccordionSummary>
      <AccordionDetails>
        {assigned.map(a => <CrewPersonCard showVehicleSelect ... />)}
      </AccordionDetails>
    </Accordion>
  ))}
</Box>
```

**Step 4: Run tests**

Run: `NO_COLOR=1 npx vitest run src/components/pages/CrewAssignmentBoard.test.tsx`
Expected: PASS

**Step 5: Commit**

```
feat: add CrewAssignmentBoard with responsive Kanban/Accordion layout
```

---

### Task 6: Integrate into EinsatzDetails page

**Files:**
- Modify: `src/components/pages/EinsatzDetails.tsx:345-346` (insert Besatzung section)

**Step 1: Write a test for the integration**

Create or extend test for EinsatzDetails to verify:
- When `alarm` is loaded and has confirmed recipients, "Besatzung" section appears
- When no alarm linked, Besatzung section is hidden

**Step 2: Run tests to verify they fail**

Run: `NO_COLOR=1 npx vitest run src/components/pages/EinsatzDetails`
Expected: FAIL

**Step 3: Add the import and section**

In `src/components/pages/EinsatzDetails.tsx`:

Add import at top (after line 49):
```typescript
import CrewAssignmentBoard from './CrewAssignmentBoard';
```

After line 345 (closing `)}` of BlaulichtSMS block), insert:

```tsx
      {/* Besatzung */}
      {alarm && alarm.recipients.some((r) => r.participation === 'yes') && (
        <Box sx={{ mb: 3 }}>
          <CrewAssignmentBoard alarm={alarm} />
        </Box>
      )}
```

**Step 4: Run tests**

Run: `NO_COLOR=1 npx vitest run src/components/pages/EinsatzDetails`
Expected: PASS

**Step 5: Run full check**

Run: `npm run check`
Expected: All pass (tsc, lint, tests, build)

**Step 6: Commit**

```
feat: integrate Besatzungszuordnung in EinsatzDetails page
```

---

### Task 7: Add Firestore security rules for crew collection

**Files:**
- Modify: `firebase/firestore.rules` (add rules for `crew` subcollection)
- Modify: `firebase/firestore-dev.rules` (same)

**Step 1: Add rules**

In both rules files, inside the `match /call/{firecallId}` block, add:

```
match /crew/{crewId} {
  allow read: if isAuthorized();
  allow write: if isAuthorized();
}
```

Follow the same pattern as the existing `item`, `history`, and `auditlog` subcollection rules.

**Step 2: Commit**

```
feat: add Firestore security rules for crew subcollection
```

---

### Task 8: Final integration test and cleanup

**Step 1: Run full check**

Run: `npm run check`
Expected: All pass

**Step 2: Manual test checklist**

- [ ] Open an Einsatz with linked BlaulichtSMS alarm
- [ ] Verify "Besatzung" section appears with confirmed personnel
- [ ] Desktop: drag person from "Verfügbar" to a vehicle column
- [ ] Desktop: drag person between vehicles
- [ ] Mobile: use Fahrzeug select to assign person
- [ ] Change Funktion via dropdown
- [ ] Verify changes persist on page reload
- [ ] Verify Einsatz without BlaulichtSMS shows no Besatzung section

**Step 3: Final commit if needed**

```
chore: cleanup crew assignment feature
```
