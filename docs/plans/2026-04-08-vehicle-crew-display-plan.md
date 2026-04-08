# Vehicle Crew Display Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Show crew assignments on vehicles in map popups and the detail dialog, with inline editing of function and vehicle assignment.

**Architecture:** Extend FirecallProvider to centrally load and cache crew assignments. Add a `useCrewForVehicle(vehicleId)` hook that filters from context. Extract `funktionAbkuerzung()` to shared utility. Create a `VehicleCrewPopup` React component for the map popup and a `VehicleCrewSection` component for inline editing in the FirecallItemDialog.

**Tech Stack:** React 19, MUI, Firebase/Firestore, Next.js 16 App Router, Vitest + Testing Library

---

### Task 1: Extract `funktionAbkuerzung` to shared utility

The abbreviation map is currently local to `CrewAssignmentBoard.tsx`. Both the popup and dialog will need it.

**Files:**
- Modify: `src/components/firebase/firestore.ts:290-297` (add export after CREW_FUNKTIONEN)
- Modify: `src/components/pages/CrewAssignmentBoard.tsx:186-196` (remove local function, import shared one)

**Step 1: Add the shared utility to firestore.ts**

Add after the `CREW_FUNKTIONEN` array (line 297):

```typescript
export function funktionAbkuerzung(funktion: CrewFunktion): string {
  const map: Record<CrewFunktion, string> = {
    Feuerwehrmann: 'FM',
    Maschinist: 'MA',
    Gruppenkommandant: 'GK',
    Atemschutzträger: 'ATS',
    Zugskommandant: 'ZK',
    Einsatzleiter: 'EL',
  };
  return map[funktion];
}
```

**Step 2: Update CrewAssignmentBoard.tsx to import it**

Replace the local `funktionAbkuerzung` function (lines 186-196) with an import from `firestore`:

```typescript
import { funktionAbkuerzung } from '../firebase/firestore';
```

Remove the local function definition.

**Step 3: Verify build**

Run: `npx tsc --noEmit`
Expected: No errors

**Step 4: Commit**

```
feat: extract funktionAbkuerzung to shared utility
```

---

### Task 2: Extend FirecallContext with crew assignments

**Files:**
- Modify: `src/hooks/useFirecall.ts:32-39` (extend FirecallContextType)
- Modify: `src/components/providers/FirecallProvider.tsx` (load crew data)
- Modify: `src/hooks/useCrewAssignments.ts` (extract mutation functions for reuse)

**Step 1: Write tests for useCrewForVehicle**

Create: `src/hooks/useCrewForVehicle.test.ts`

```typescript
import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { CrewAssignment } from '../components/firebase/firestore';

// We'll test the filtering logic directly
describe('crew filtering for vehicle', () => {
  const assignments: CrewAssignment[] = [
    { id: '1', recipientId: 'r1', name: 'Mustermann', vehicleId: 'v1', vehicleName: 'TLF', funktion: 'Gruppenkommandant' },
    { id: '2', recipientId: 'r2', name: 'Meier', vehicleId: 'v1', vehicleName: 'TLF', funktion: 'Maschinist' },
    { id: '3', recipientId: 'r3', name: 'Huber', vehicleId: 'v2', vehicleName: 'KLF', funktion: 'Feuerwehrmann' },
    { id: '4', recipientId: 'r4', name: 'Weber', vehicleId: null, vehicleName: '', funktion: 'Feuerwehrmann' },
  ];

  it('filters assignments by vehicleId', () => {
    const result = assignments.filter((c) => c.vehicleId === 'v1');
    expect(result).toHaveLength(2);
    expect(result.map((c) => c.name)).toEqual(['Mustermann', 'Meier']);
  });

  it('returns empty array for vehicle with no crew', () => {
    const result = assignments.filter((c) => c.vehicleId === 'v99');
    expect(result).toHaveLength(0);
  });
});
```

**Step 2: Run test to verify it passes**

Run: `npx vitest run src/hooks/useCrewForVehicle.test.ts`
Expected: PASS

**Step 3: Extend FirecallContextType in useFirecall.ts**

Add imports and extend the interface (lines 32-39):

```typescript
import {
  CrewAssignment,
  CrewFunktion,
} from '../components/firebase/firestore';

// ... existing imports ...

export interface FirecallContextType {
  firecall: Firecall | undefined;
  setFirecallId?: Dispatch<SetStateAction<string | undefined>>;
  crewAssignments: CrewAssignment[];
  assignVehicle: (id: string, vehicleId: string | null, vehicleName: string) => Promise<void>;
  updateFunktion: (id: string, funktion: CrewFunktion) => Promise<void>;
}
```

Update the default context:

```typescript
const noopAsync = async () => {};

export const FirecallContext = createContext<FirecallContextType>({
  firecall: defaultFirecall,
  crewAssignments: [],
  assignVehicle: noopAsync,
  updateFunktion: noopAsync,
});
```

Add the `useCrewForVehicle` hook:

```typescript
export const useCrewForVehicle = (vehicleId: string): CrewAssignment[] => {
  const { crewAssignments } = useContext(FirecallContext);
  return useMemo(
    () => crewAssignments.filter((c) => c.vehicleId === vehicleId),
    [crewAssignments, vehicleId]
  );
};

export const useCrewAssignmentActions = () => {
  const { assignVehicle, updateFunktion } = useContext(FirecallContext);
  return { assignVehicle, updateFunktion };
};
```

**Step 4: Update FirecallProvider to load crew and provide mutations**

Rewrite `src/components/providers/FirecallProvider.tsx`:

```typescript
import {
  FirecallContext,
  useLastOrSelectedFirecall,
} from '../../hooks/useFirecall';
import useCrewAssignments from '../../hooks/useCrewAssignments';

export default function FirecallProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const firecall = useLastOrSelectedFirecall();
  const { crewAssignments, assignVehicle, updateFunktion } =
    useCrewAssignments();

  return (
    <FirecallContext.Provider
      value={{
        ...firecall,
        crewAssignments,
        assignVehicle,
        updateFunktion,
      }}
    >
      {children}
    </FirecallContext.Provider>
  );
}
```

**Step 5: Update CrewAssignmentBoard to use context instead of local hook**

In `CrewAssignmentBoard.tsx`, replace the local `useCrewAssignments()` call with context access. The board still needs `syncFromAlarm`, `addManualPerson`, and `removeAssignment` — these stay in the hook. The board should continue calling `useCrewAssignments()` for those extra operations, but `crewAssignments`, `assignVehicle`, and `updateFunktion` now come from context.

No changes needed if the board keeps using `useCrewAssignments()` — the hook still returns everything. The context just makes `crewAssignments`, `assignVehicle`, `updateFunktion` available globally.

**Step 6: Verify build and tests**

Run: `npx tsc --noEmit && npx vitest run`
Expected: All pass

**Step 7: Commit**

```
feat: extend FirecallProvider with crew assignments context
```

---

### Task 3: Vehicle Crew Popup Component

**Files:**
- Create: `src/components/FirecallItems/VehicleCrewPopup.tsx`
- Create: `src/components/FirecallItems/VehicleCrewPopup.test.tsx`
- Modify: `src/components/FirecallItems/elements/FirecallVehicle.tsx:132-170` (use new component)

**Step 1: Write the test**

Create: `src/components/FirecallItems/VehicleCrewPopup.test.tsx`

```typescript
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { CrewAssignment } from '../firebase/firestore';
import VehicleCrewPopup from './VehicleCrewPopup';

// Mock the context hook
vi.mock('../../hooks/useFirecall', async () => {
  const actual = await vi.importActual('../../hooks/useFirecall');
  return {
    ...actual,
    useCrewForVehicle: (vehicleId: string) => mockCrewForVehicle,
  };
});

let mockCrewForVehicle: CrewAssignment[] = [];

describe('VehicleCrewPopup', () => {
  it('renders crew with function abbreviation when not FM', () => {
    mockCrewForVehicle = [
      { id: '1', recipientId: 'r1', name: 'Mustermann', vehicleId: 'v1', vehicleName: 'TLF', funktion: 'Gruppenkommandant' },
      { id: '2', recipientId: 'r2', name: 'Meier', vehicleId: 'v1', vehicleName: 'TLF', funktion: 'Maschinist' },
    ];
    render(<VehicleCrewPopup vehicleId="v1" />);
    expect(screen.getByText(/Mustermann \(GK\)/)).toBeInTheDocument();
    expect(screen.getByText(/Meier \(MA\)/)).toBeInTheDocument();
  });

  it('renders crew without abbreviation for FM', () => {
    mockCrewForVehicle = [
      { id: '3', recipientId: 'r3', name: 'Huber', vehicleId: 'v1', vehicleName: 'TLF', funktion: 'Feuerwehrmann' },
    ];
    render(<VehicleCrewPopup vehicleId="v1" />);
    expect(screen.getByText('Huber')).toBeInTheDocument();
    expect(screen.queryByText(/FM/)).not.toBeInTheDocument();
  });

  it('renders nothing when no crew assigned', () => {
    mockCrewForVehicle = [];
    const { container } = render(<VehicleCrewPopup vehicleId="v1" />);
    expect(container.textContent).toBe('');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/FirecallItems/VehicleCrewPopup.test.tsx`
Expected: FAIL (module not found)

**Step 3: Implement VehicleCrewPopup**

Create: `src/components/FirecallItems/VehicleCrewPopup.tsx`

```tsx
'use client';

import { useCrewForVehicle } from '../../hooks/useFirecall';
import { funktionAbkuerzung } from '../firebase/firestore';

export default function VehicleCrewPopup({
  vehicleId,
}: {
  vehicleId: string;
}) {
  const crew = useCrewForVehicle(vehicleId);

  if (crew.length === 0) return null;

  return (
    <>
      <br />
      <span style={{ borderTop: '1px solid #ccc', display: 'block', marginTop: 4, paddingTop: 4 }}>
        {crew.map((c) => (
          <span key={c.id}>
            {c.name}
            {c.funktion !== 'Feuerwehrmann' && ` (${funktionAbkuerzung(c.funktion)})`}
            <br />
          </span>
        ))}
      </span>
    </>
  );
}
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run src/components/FirecallItems/VehicleCrewPopup.test.tsx`
Expected: PASS

**Step 5: Integrate into FirecallVehicle.popupFn()**

Modify `src/components/FirecallItems/elements/FirecallVehicle.tsx`. Replace `popupFn()` (lines 132-170):

```tsx
import VehicleCrewPopup from '../VehicleCrewPopup';

// ... in the class ...

public popupFn(): ReactNode {
  return (
    <>
      <b>
        {this.name} {this.fw || ''}
      </b>
      {this.besatzung && Number.parseInt(this.besatzung) > 0 && (
        <>
          <br />
          Besatzung: 1:{this.besatzung}
        </>
      )}
      {this.ats !== undefined && this.ats > 0 && (
        <>
          {!(this.besatzung && Number.parseInt(this.besatzung) > 0) && <br />}{' '}
          ({this.ats} ATS)
        </>
      )}
      {this.alarmierung && (
        <>
          <br />
          Alarmierung: {formatTimestamp(this.alarmierung)}
        </>
      )}
      {this.eintreffen && (
        <>
          <br />
          Eintreffen: {formatTimestamp(this.eintreffen)}
        </>
      )}
      {this.abruecken && (
        <>
          <br />
          Abrücken: {formatTimestamp(this.abruecken)}
        </>
      )}
      {this.id && <VehicleCrewPopup vehicleId={this.id} />}
    </>
  );
}
```

**Step 6: Verify build and tests**

Run: `npx tsc --noEmit && npx vitest run`
Expected: All pass

**Step 7: Commit**

```
feat: show crew assignments in vehicle map popup
```

---

### Task 4: Vehicle Crew Section for Detail Dialog

**Files:**
- Create: `src/components/FirecallItems/VehicleCrewSection.tsx`
- Create: `src/components/FirecallItems/VehicleCrewSection.test.tsx`
- Modify: `src/components/FirecallItems/FirecallItemDialog.tsx:408-424` (add section for vehicles)

**Step 1: Write the test**

Create: `src/components/FirecallItems/VehicleCrewSection.test.tsx`

```typescript
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { CrewAssignment, Fzg } from '../firebase/firestore';
import VehicleCrewSection from './VehicleCrewSection';

// Mock hooks
const mockCrew: CrewAssignment[] = [
  { id: '1', recipientId: 'r1', name: 'Mustermann', vehicleId: 'v1', vehicleName: 'TLF', funktion: 'Gruppenkommandant' },
  { id: '2', recipientId: 'r2', name: 'Meier', vehicleId: 'v1', vehicleName: 'TLF', funktion: 'Feuerwehrmann' },
];

const mockVehicles: Fzg[] = [
  { id: 'v1', name: 'TLF', type: 'vehicle' } as Fzg,
  { id: 'v2', name: 'KLF', type: 'vehicle' } as Fzg,
];

vi.mock('../../hooks/useFirecall', async () => {
  const actual = await vi.importActual('../../hooks/useFirecall');
  return {
    ...actual,
    useCrewForVehicle: () => mockCrew,
    useCrewAssignmentActions: () => ({
      assignVehicle: vi.fn(),
      updateFunktion: vi.fn(),
    }),
  };
});

vi.mock('../../hooks/useVehicles', () => ({
  default: () => ({
    vehicles: mockVehicles,
    tacticalUnits: [],
    rohre: [],
    otherItems: [],
    displayItems: [],
    firecallItems: [],
  }),
}));

describe('VehicleCrewSection', () => {
  it('renders crew members with their names', () => {
    render(<VehicleCrewSection vehicleId="v1" />);
    expect(screen.getByText('Mustermann')).toBeInTheDocument();
    expect(screen.getByText('Meier')).toBeInTheDocument();
  });

  it('shows Besatzung heading', () => {
    render(<VehicleCrewSection vehicleId="v1" />);
    expect(screen.getByText('Besatzung')).toBeInTheDocument();
  });

  it('renders nothing when no vehicle id', () => {
    const { container } = render(<VehicleCrewSection vehicleId="" />);
    expect(container.textContent).toBe('');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/FirecallItems/VehicleCrewSection.test.tsx`
Expected: FAIL (module not found)

**Step 3: Implement VehicleCrewSection**

Create: `src/components/FirecallItems/VehicleCrewSection.tsx`

```tsx
'use client';

import Box from '@mui/material/Box';
import FormControl from '@mui/material/FormControl';
import MenuItem from '@mui/material/MenuItem';
import Select, { SelectChangeEvent } from '@mui/material/Select';
import Typography from '@mui/material/Typography';
import { useCrewAssignmentActions, useCrewForVehicle } from '../../hooks/useFirecall';
import useVehicles from '../../hooks/useVehicles';
import {
  CREW_FUNKTIONEN,
  CrewFunktion,
  funktionAbkuerzung,
} from '../firebase/firestore';

export default function VehicleCrewSection({
  vehicleId,
}: {
  vehicleId: string;
}) {
  const crew = useCrewForVehicle(vehicleId);
  const { assignVehicle, updateFunktion } = useCrewAssignmentActions();
  const { vehicles } = useVehicles();

  if (!vehicleId) return null;

  const handleFunktionChange = (assignmentId: string, funktion: CrewFunktion) => {
    updateFunktion(assignmentId, funktion);
  };

  const handleVehicleChange = (assignmentId: string, newVehicleId: string) => {
    if (newVehicleId === '') {
      assignVehicle(assignmentId, null, '');
    } else {
      const vehicle = vehicles.find((v) => v.id === newVehicleId);
      assignVehicle(assignmentId, newVehicleId, vehicle?.name || '');
    }
  };

  return (
    <Box sx={{ mt: 2 }}>
      <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1 }}>
        Besatzung{crew.length > 0 ? ` (${crew.length})` : ''}
      </Typography>
      {crew.length === 0 ? (
        <Typography variant="body2" color="text.secondary">
          Keine Besatzung zugeordnet
        </Typography>
      ) : (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          {crew.map((c) => (
            <Box
              key={c.id}
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 1,
                flexWrap: 'wrap',
              }}
            >
              <Typography variant="body2" sx={{ minWidth: 120, flexShrink: 0 }}>
                {c.name}
              </Typography>
              <FormControl size="small" sx={{ minWidth: 100 }}>
                <Select
                  value={c.funktion}
                  onChange={(e: SelectChangeEvent) =>
                    handleFunktionChange(c.id!, e.target.value as CrewFunktion)
                  }
                  variant="standard"
                  sx={{ fontSize: '0.875rem' }}
                >
                  {CREW_FUNKTIONEN.map((f) => (
                    <MenuItem key={f} value={f}>
                      {funktionAbkuerzung(f)} — {f}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
              <FormControl size="small" sx={{ minWidth: 120 }}>
                <Select
                  value={c.vehicleId || ''}
                  onChange={(e: SelectChangeEvent) =>
                    handleVehicleChange(c.id!, e.target.value)
                  }
                  variant="standard"
                  sx={{ fontSize: '0.875rem' }}
                >
                  <MenuItem value="">Verfügbar</MenuItem>
                  {vehicles.map((v) => (
                    <MenuItem key={v.id} value={v.id}>
                      {v.name}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Box>
          ))}
        </Box>
      )}
    </Box>
  );
}
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run src/components/FirecallItems/VehicleCrewSection.test.tsx`
Expected: PASS

**Step 5: Integrate into FirecallItemDialog**

Modify `src/components/FirecallItems/FirecallItemDialog.tsx`. Add import at top:

```typescript
import VehicleCrewSection from './VehicleCrewSection';
```

After the `ItemDataFields` section (around line 423), add:

```tsx
{item.type === 'vehicle' && item.id && (
  <VehicleCrewSection vehicleId={item.id} />
)}
```

This should go right after the closing of the `item.type !== 'layer'` block (after `ItemDataFields`), before the closing `</>` of the non-upload branch.

**Step 6: Verify build and all tests**

Run: `npx tsc --noEmit && npx vitest run`
Expected: All pass

**Step 7: Commit**

```
feat: add crew assignment section to vehicle detail dialog
```

---

### Task 5: Final verification and lint

**Step 1: Run full check**

Run: `npm run check`
Expected: tsc, lint, tests, build all pass

**Step 2: Fix any issues found**

Address lint warnings or type errors.

**Step 3: Commit any fixes**

```
fix: address lint/type issues from crew display feature
```
