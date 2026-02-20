# Audit Log Feature Plan

## Context

Firecall changes (to the firecall itself, its items, locations, etc.) are currently not tracked beyond `updatedBy`/`updatedAt` metadata. This feature adds a full audit trail as a Firestore subcollection per firecall, plus a UI page to view, search, sort, and filter the log.

## Data Model

**New Firestore subcollection**: `call/{firecallId}/auditlog/{entryId}`

**New collection constant** in `src/components/firebase/firestore.ts`:
```
FIRECALL_AUDITLOG_COLLECTION_ID = 'auditlog'
```

**AuditLogEntry interface** (in `src/components/firebase/firestore.ts`):
```typescript
interface AuditLogEntry {
  id?: string;
  timestamp: string;           // ISO timestamp
  user: string;                // email of acting user
  action: 'create' | 'update' | 'delete';
  elementType: string;         // 'firecall' | 'vehicle' | 'diary' | 'location' | 'kostenersatz' | etc.
  elementId: string;           // Firestore document ID
  elementName: string;         // Human-readable title/name
  previousValue?: Record<string, any>;  // relevant fields before change
  newValue?: Record<string, any>;       // relevant fields after change
}
```

## User Identity Integrity

The `user` field in audit log entries is populated from `useFirebaseLogin()` which reads `email` from the Firebase Auth token (not user input). This is the same verified identity used by all existing mutation hooks (`useFirecallItemAdd`, `useFirecallItemUpdate`, etc.) for their `creator`/`updatedBy` fields.

The audit log write happens in the **same hook call** as the mutation, using the **same email variable** — so the logged user is always the same as the one performing the action.

The existing Firestore security rule `match /{subitem=**} { allow read, write: if callAuthorized() }` already covers all firecall subcollections (items, locations, layers, and now auditlog). Since `callAuthorized()` requires a valid Firebase Auth token, only authenticated and authorized users can write audit log entries.

**Future hardening** (optional, not in this PR): Replace the `{subitem=**}` wildcard with specific subcollection rules to make audit log entries append-only (create but no update/delete).

## Implementation Steps

### 1. Type & constant definitions
**File**: `src/components/firebase/firestore.ts`
- Add `FIRECALL_AUDITLOG_COLLECTION_ID = 'auditlog'`
- Add `AuditLogEntry` interface

### 2. Audit log write hook
**New file**: `src/hooks/useAuditLog.ts`
- `useAuditLog()` hook returns `logChange(entry: Omit<AuditLogEntry, 'id' | 'timestamp' | 'user'>)`
- Internally uses `useFirecallId()` and `useFirebaseLogin()` to auto-fill `timestamp` and `user`
- Writes to `call/{firecallId}/auditlog/` via `addDoc`

### 3. Instrument existing mutation hooks

Each hook gets audit logging added **after** the successful Firestore write. The hooks already have access to user email and firecall ID. The audit log call is fire-and-forget (no await) to avoid slowing down the mutation.

**`src/hooks/useFirecallItemAdd.ts`**:
- After `addDoc` succeeds, log `action: 'create'` with the new item data

**`src/hooks/useFirecallItemUpdate.ts`**:
- Accept optional `previousItem` parameter for diff tracking
- After `setDoc` succeeds, log `action: 'update'` with previous and new values
- Note: callers that have the original item can pass it; for callers that don't, `previousValue` will be omitted

**`src/components/pages/Einsaetze.tsx`** (`useFirecallUpdate`):
- After `setDoc` succeeds, log `action: 'update'` for firecall changes

**`src/hooks/useFirecallLocations.ts`**:
- `addLocation`: log `action: 'create'`
- `updateLocation`: log `action: 'update'` with the update fields
- `deleteLocation`: log `action: 'delete'`

**`src/hooks/useKostenersatzMutations.ts`** (core hooks only):
- `useKostenersatzAdd`: log `action: 'create'`
- `useKostenersatzUpdate`: log `action: 'update'`
- `useKostenersatzDelete`: log `action: 'delete'`

### 4. Audit log data hook
**New file**: `src/hooks/useAuditLog.ts` (same file, additional export)
- `useAuditLogEntries()` hook that uses `useFirebaseCollection` to fetch entries from `call/{firecallId}/auditlog/`, ordered by `timestamp` desc

### 5. Audit log page component
**New file**: `src/components/pages/AuditLog.tsx`

Following the EinsatzTagebuch pattern (MUI Grid layout with SortableHeader):
- **Search**: Text field that filters across user, elementName, elementType, action
- **Sort**: Sortable columns for timestamp, user, action, elementType, elementName
- **Filter**: Dropdown filters for action type and element type
- **Detail view**: Click a row to expand/show a diff of previous vs new values (JSON display)
- **CSV download**: Reuse existing `downloadRowsAsCsv` pattern

Columns: Zeitpunkt | Benutzer | Aktion | Typ | Element | Details

### 6. Route and navigation
**New file**: `src/app/auditlog/page.tsx` - thin wrapper importing AuditLog component
**Modify**: `src/components/site/AppDrawer.tsx` - add "Audit Log" entry with `HistoryIcon` and `admin: true` (admin-only visibility)

## Files to Create
- `src/hooks/useAuditLog.ts`
- `src/components/pages/AuditLog.tsx`
- `src/app/auditlog/page.tsx`

## Files to Modify
- `src/components/firebase/firestore.ts` (type + constant)
- `src/hooks/useFirecallItemAdd.ts` (add logging)
- `src/hooks/useFirecallItemUpdate.ts` (add logging)
- `src/hooks/useFirecallLocations.ts` (add logging)
- `src/hooks/useKostenersatzMutations.ts` (add logging to 3 hooks)
- `src/components/pages/Einsaetze.tsx` (add logging to useFirecallUpdate)
- `src/components/site/AppDrawer.tsx` (nav entry)

## Verification
- `npm run build` to ensure no type/compilation errors
- Manual: create/update/delete a firecall item, check Firestore for auditlog entries
- Manual: visit `/auditlog` page, verify entries appear with search/sort/filter working
