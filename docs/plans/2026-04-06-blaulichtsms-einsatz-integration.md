# BlaulichtSMS-Einsatz Integration

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** BlaulichtSMS-Alarm-Details auf der Einsatz-Detailseite anzeigen, Alarm-ID beim Erstellen speichern, und auf der BlaulichtSMS-Seite zugeordnete Einsätze verlinken + "Einsatz erstellen" Button.

**Architecture:** `blaulichtSmsAlarmId` wird im Firecall-Dokument gespeichert. Eine neue Server Action `getBlaulichtSmsAlarmById` lädt gezielt einen einzelnen Alarm. Die Detailseite nutzt diese Action. Die BlaulichtSMS-Seite nutzt eine Server Action um Einsätze mit passender `blaulichtSmsAlarmId` zu finden.

**Tech Stack:** Next.js Server Actions, Firestore, React, MUI

---

### Task 1: Firecall Interface erweitern

**Files:**
- Modify: `src/components/firebase/firestore.ts:263-278`

**Step 1: Add `blaulichtSmsAlarmId` to Firecall interface**

In `src/components/firebase/firestore.ts`, add to the `Firecall` interface:

```typescript
export interface Firecall {
  id?: string;
  name: string;
  fw?: string;
  date?: string;
  description?: string;
  deleted?: boolean;
  eintreffen?: string;
  abruecken?: string;
  lat?: number;
  lng?: number;
  group?: string;
  attachments?: string[];
  autoSnapshotInterval?: number;
  blaulichtSmsAlarmId?: string;
  [key: string]: any;
}
```

**Step 2: Commit**

```bash
git add src/components/firebase/firestore.ts
git commit -m "feat: add blaulichtSmsAlarmId to Firecall interface"
```

---

### Task 2: EinsatzDialog — Alarm-ID beim Erstellen speichern

**Files:**
- Modify: `src/components/FirecallItems/EinsatzDialog.tsx:79-93`

**Step 1: Update `applyAlarm` to include alarmId**

Change the `applyAlarm` callback to also set `blaulichtSmsAlarmId`:

```typescript
const applyAlarm = useCallback((alarm: BlaulichtSmsAlarm) => {
  const parts = alarm.alarmText.split('/');
  const name = parts.length >= 5
    ? [parts[2], parts[3], parts[4]].join(' ').trim()
    : alarm.alarmText;
  const coords =
    alarm.geolocation?.coordinates ?? alarm.coordinates ?? null;
  setEinsatz((prev) => ({
    ...prev,
    name,
    date: new Date(alarm.alarmDate).toISOString(),
    description: alarm.alarmText,
    blaulichtSmsAlarmId: alarm.alarmId,
    ...(coords ? { lat: coords.lat, lng: coords.lon } : {}),
  }));
}, []);
```

Also clear `blaulichtSmsAlarmId` when user selects "Manuell eingeben" (empty alarmId) in `handleAlarmChange`:

```typescript
const handleAlarmChange = useCallback(
  (event: SelectChangeEvent) => {
    const alarmId = event.target.value;
    setSelectedAlarmId(alarmId);
    if (alarmId) {
      const alarm = alarms.find((a) => a.alarmId === alarmId);
      if (alarm) {
        applyAlarm(alarm);
      }
    } else {
      setEinsatz((prev) => ({ ...prev, blaulichtSmsAlarmId: undefined }));
    }
  },
  [alarms, applyAlarm]
);
```

**Step 2: Commit**

```bash
git add src/components/FirecallItems/EinsatzDialog.tsx
git commit -m "feat: save blaulichtSmsAlarmId when creating Einsatz from BlaulichtSMS"
```

---

### Task 3: Neue Server Action `getBlaulichtSmsAlarmById`

**Files:**
- Modify: `src/app/blaulicht-sms/actions.ts`

**Step 1: Write test**

Create `src/app/blaulicht-sms/actions.test.ts` — test that `getBlaulichtSmsAlarmById` returns the matching alarm or `null`.

Note: Since the actual function calls external API + requires auth, test the filtering logic by extracting a helper or mocking. Given the server action pattern, a focused integration-style test may be more practical. At minimum, test that the function is exported.

**Step 2: Add `getBlaulichtSmsAlarmById` to actions.ts**

Append to `src/app/blaulicht-sms/actions.ts`:

```typescript
export async function getBlaulichtSmsAlarmById(
  groupId: string,
  alarmId: string
): Promise<BlaulichtSmsAlarm | null> {
  await actionUserRequired();

  const alarms = await getBlaulichtSmsAlarms(groupId);
  return alarms.find((a) => a.alarmId === alarmId) ?? null;
}
```

Note: The BlaulichtSMS API doesn't support fetching a single alarm — we must fetch all and filter. But we wrap this in a dedicated function so the client only gets one alarm back, and the API could be optimized later.

**Step 3: Commit**

```bash
git add src/app/blaulicht-sms/actions.ts src/app/blaulicht-sms/actions.test.ts
git commit -m "feat: add getBlaulichtSmsAlarmById server action"
```

---

### Task 4: Neue Server Action `getFirecallsByAlarmIds`

**Files:**
- Modify: `src/app/blaulicht-sms/actions.ts`

**Step 1: Add query function**

Add a server action that queries Firestore for Einsätze matching given BlaulichtSMS alarm IDs:

```typescript
export async function getFirecallsByAlarmIds(
  alarmIds: string[]
): Promise<Record<string, { id: string; name: string }>> {
  await actionUserRequired();

  if (alarmIds.length === 0) return {};

  // Firestore 'in' queries support max 30 values
  const results: Record<string, { id: string; name: string }> = {};
  const chunks = [];
  for (let i = 0; i < alarmIds.length; i += 30) {
    chunks.push(alarmIds.slice(i, i + 30));
  }

  for (const chunk of chunks) {
    const snapshot = await firestore
      .collection('call')
      .where('blaulichtSmsAlarmId', 'in', chunk)
      .where('deleted', '!=', true)
      .get();
    for (const doc of snapshot.docs) {
      const data = doc.data();
      results[data.blaulichtSmsAlarmId] = { id: doc.id, name: data.name };
    }
  }

  return results;
}
```

**Step 2: Commit**

```bash
git add src/app/blaulicht-sms/actions.ts
git commit -m "feat: add getFirecallsByAlarmIds server action"
```

---

### Task 5: BlaulichtSMS-Alarm-Details auf EinsatzDetails anzeigen

**Files:**
- Modify: `src/components/pages/EinsatzDetails.tsx`

**Step 1: Add BlaulichtSMS alarm loading and display**

After the existing imports, add:
```typescript
import { getBlaulichtSmsAlarmById, BlaulichtSmsAlarm } from '../../app/blaulicht-sms/actions';
```

In the component, after loading the firecall, add alarm loading:
```typescript
const [alarm, setAlarm] = useState<BlaulichtSmsAlarm | null>(null);
const [alarmLoading, setAlarmLoading] = useState(false);

useEffect(() => {
  if (!firecall?.blaulichtSmsAlarmId || !firecall?.group) return;
  setAlarmLoading(true);
  getBlaulichtSmsAlarmById(firecall.group, firecall.blaulichtSmsAlarmId)
    .then(setAlarm)
    .catch((err) => console.error('Failed to load BlaulichtSMS alarm:', err))
    .finally(() => setAlarmLoading(false));
}, [firecall?.blaulichtSmsAlarmId, firecall?.group]);
```

Add a section in the JSX after the Einsatz info Grid and before Attachments. Show:
- Alarm text, time, end time, author
- Function chips with counts (reuse the pattern from `AlarmCard` in the BlaulichtSMS page)
- Attendee list with function chips

Extract `AlarmCard` from `src/app/blaulicht-sms/page.tsx` into a shared component `src/app/blaulicht-sms/AlarmCard.tsx` to avoid duplication. Or inline a simpler version. Recommendation: extract `AlarmCard` to reuse it.

**Step 2: Commit**

```bash
git add src/components/pages/EinsatzDetails.tsx src/app/blaulicht-sms/AlarmCard.tsx src/app/blaulicht-sms/page.tsx
git commit -m "feat: show BlaulichtSMS alarm details on EinsatzDetails page"
```

---

### Task 6: BlaulichtSMS-Seite — Einsatz-Zuordnung und "Einsatz erstellen" Button

**Files:**
- Modify: `src/app/blaulicht-sms/page.tsx`
- Modify: `src/app/blaulicht-sms/AlarmCard.tsx` (extracted in Task 5)

**Step 1: Load firecall mappings**

In `BlaulichtSmsPage`, after alarms are loaded, call `getFirecallsByAlarmIds` with the alarm IDs:

```typescript
const [firecallMap, setFirecallMap] = useState<Record<string, { id: string; name: string }>>({});

// Inside the loadData effect, after setting alarms:
const alarmIds = sorted.map((a) => a.alarmId);
if (alarmIds.length > 0) {
  const mapping = await getFirecallsByAlarmIds(alarmIds);
  setFirecallMap(mapping);
}
```

**Step 2: Pass mapping + callbacks to AlarmCard**

Extend `AlarmCard` props to accept:
- `firecall?: { id: string; name: string }` — linked firecall if exists
- `onCreateEinsatz?: (alarm: BlaulichtSmsAlarm) => void` — callback to create Einsatz

In AlarmCard, show:
- If `firecall` is set: a Link/Button "Einsatz: {name}" linking to `/einsatz/{id}/details`
- If not: an "Einsatz erstellen" Button that calls `onCreateEinsatz`

**Step 3: Add EinsatzDialog integration**

In `BlaulichtSmsPage`, add state for creating an Einsatz from an alarm:

```typescript
const [createFromAlarm, setCreateFromAlarm] = useState<BlaulichtSmsAlarm | null>(null);
```

When "Einsatz erstellen" is clicked, open `EinsatzDialog` pre-filled with the alarm data. The `EinsatzDialog` already supports the `einsatz` prop for pre-filling. Construct a pre-filled Firecall:

```typescript
{createFromAlarm && (
  <EinsatzDialog
    onClose={(fc) => {
      setCreateFromAlarm(null);
      if (fc) {
        // Refresh mapping
        setFirecallMap((prev) => ({
          ...prev,
          [createFromAlarm.alarmId]: { id: fc.id || '', name: fc.name },
        }));
      }
    }}
  />
)}
```

But since `EinsatzDialog` handles its own alarm loading, and we already have the alarm data, we should pre-fill via the `einsatz` prop with the alarm data already applied (name, date, description, coords, blaulichtSmsAlarmId, group).

**Step 4: Commit**

```bash
git add src/app/blaulicht-sms/page.tsx src/app/blaulicht-sms/AlarmCard.tsx
git commit -m "feat: show linked Einsatz and 'Einsatz erstellen' button on BlaulichtSMS page"
```

---

### Task 7: Run checks and fix issues

**Step 1: Run full check suite**

```bash
npm run check
```

**Step 2: Fix any TypeScript, lint, or test errors**

**Step 3: Commit fixes if needed**

```bash
git commit -m "fix: address lint/type errors from BlaulichtSMS integration"
```
