# Login Performance Optimization — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Login von ~3.5s auf ~300ms bei Page-Reload optimieren, dem User detailliertes Schritt-Feedback zeigen, und Gruppen-Änderungen sofort in die UI übernehmen.

**Architecture:** Stale-while-revalidate Caching auf Client (SessionStorage) und Server (In-Memory Maps). Login-Steps als State im Observer-Hook, angezeigt als Checkliste in LoginUi. Debug-Timing bleibt für Production.

**Tech Stack:** React 19, MUI, Firebase Auth, NextAuth.js, Firestore

---

## Task 1: LoginStep-Typ und State definieren

**Files:**
- Modify: `src/hooks/auth/types.ts`

**Step 1: LoginStep-Typ zu types.ts hinzufügen**

Am Ende der Datei, vor dem bestehenden `AuthState` Interface, den neuen Typ und das erweiterte `LoginData` Feld einfügen:

```typescript
export type LoginStep =
  | 'idle'
  | 'authenticating'
  | 'verifying'
  | 'loading_permissions'
  | 'done';
```

In `LoginData` das neue Feld hinzufügen:

```typescript
export interface LoginData {
  // ... bestehende Felder ...
  loginStep: LoginStep;
}
```

In `LoginStatus` das Feld wird automatisch über `extends LoginData` vererbt.

**Step 2: Verifizieren dass tsc kompiliert**

Run: `npx tsc --noEmit 2>&1 | head -20`
Expected: Kompilierungsfehler in Dateien die `LoginData` nutzen (weil `loginStep` jetzt Pflichtfeld ist). Das ist erwartet — wird in Task 2 behoben.

**Step 3: Commit**

```bash
git add src/hooks/auth/types.ts
git commit -m "feat: add LoginStep type for login progress tracking"
```

---

## Task 2: loginStep State im Observer-Hook setzen

**Files:**
- Modify: `src/hooks/useFirebaseLoginObserver.ts`

**Step 1: loginStep in getInitialLoginStatus und den Hook integrieren**

In `getInitialLoginStatus()`:
- Wenn `cachedAuth` vorhanden: `loginStep: 'done'` setzen (User war bereits eingeloggt)
- Sonst: `loginStep: 'idle'`

In `useFirebaseLoginObserver()`:

Im `onAuthStateChanged`-Handler die Steps setzen:
1. Wenn `user` vorhanden: sofort `loginStep: 'authenticating'` setzen
2. Vor `serverLoginRef.current()`: `loginStep: 'verifying'`
3. Vor `refreshRef.current()`: `loginStep: 'loading_permissions'`
4. Nach `refreshRef.current()` (also wo `login completed for` geloggt wird): `loginStep: 'done'`

Wenn `user === null` (Logout): `loginStep: 'idle'`

Konkreter Code für den `onAuthStateChanged`-Handler (nur die Step-Zeilen, bestehende Logik bleibt):

```typescript
async (user: User | null) => {
  const timer = loginTimer('onAuthStateChanged');
  const u: User | undefined = user != null ? user : undefined;
  setUid(u?.uid);

  if (user) {
    setLoginStatus((prev) => ({ ...prev, loginStep: 'authenticating' }));

    timer.step('getIdToken (initial)');
    const token = await user.getIdToken();
    if (token) {
      setLoginStatus((prev) => ({ ...prev, loginStep: 'verifying' }));
      timer.step('serverLogin');
      await serverLoginRef.current();

      timer.step('getIdToken (force refresh)');
      await user.getIdToken(true);
    }

    // ... bestehender tokenResult/authData Code ...

    setLoginStatus((prev) => ({
      ...prev,
      ...authData,
      loginStep: 'loading_permissions',
    }));
    timer.step('refresh');
    await refreshRef.current();
    setLoginStatus((prev) => ({ ...prev, loginStep: 'done' }));
    timer.done();
    console.info(`login completed for ${user.email}`);
  } else {
    setLoginStatus((prev) => ({
      ...prev,
      isSignedIn: false,
      isAuthLoading: false,
      user: undefined,
      loginStep: 'idle',
    }));
    timer.done();
  }
}
```

**Step 2: Verifizieren dass tsc kompiliert**

Run: `npx tsc --noEmit 2>&1 | head -20`
Expected: PASS (keine Fehler)

**Step 3: Commit**

```bash
git add src/hooks/useFirebaseLoginObserver.ts
git commit -m "feat: set loginStep state at each phase of the login flow"
```

---

## Task 3: Login-Schritte in LoginUi anzeigen

**Files:**
- Modify: `src/components/pages/LoginUi.tsx`

**Step 1: LoginSteps-Anzeige implementieren**

Imports hinzufügen:

```typescript
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import RadioButtonUncheckedIcon from '@mui/icons-material/RadioButtonUnchecked';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import ListItemIcon from '@mui/material/ListItemIcon';
import ListItemText from '@mui/material/ListItemText';
import { LoginStep } from '../../hooks/auth/types';
```

`loginStep` aus dem Hook destrukturieren (neben `isSignedIn`, etc.):

```typescript
const { ..., loginStep } = useFirebaseLogin();
```

Neue Hilfskonstante für die Step-Konfiguration, innerhalb der Komponente:

```typescript
const loginSteps: { key: LoginStep; label: string }[] = [
  { key: 'authenticating', label: 'Anmeldung wird durchgeführt' },
  { key: 'verifying', label: 'Anmeldung wird verifiziert' },
  { key: 'loading_permissions', label: 'Berechtigungen werden geladen' },
  { key: 'done', label: 'Anmeldung abgeschlossen' },
];

const stepOrder: LoginStep[] = loginSteps.map((s) => s.key);
const currentStepIndex = stepOrder.indexOf(loginStep ?? 'idle');
```

Den bestehenden `isAutoLoginInProgress` Block (Zeilen 65-88) ersetzen durch:

```tsx
{(isAutoLoginInProgress || (isSignedIn && loginStep !== 'done' && loginStep !== 'idle')) && (
  <Paper
    sx={{
      p: 3,
      m: 2,
      backgroundColor: 'action.hover',
    }}
  >
    <Typography variant="body1" fontWeight="medium" sx={{ mb: 2 }}>
      {isRefreshing && !isSignedIn
        ? 'Gespeicherte Anmeldung wird geladen...'
        : 'Anmeldung läuft...'}
    </Typography>
    <List dense disablePadding>
      {loginSteps.map((step, index) => {
        const isCompleted = currentStepIndex > index;
        const isCurrent = currentStepIndex === index;
        return (
          <ListItem key={step.key} disableGutters sx={{ py: 0.25 }}>
            <ListItemIcon sx={{ minWidth: 32 }}>
              {isCompleted ? (
                <CheckCircleIcon color="success" fontSize="small" />
              ) : isCurrent ? (
                <CircularProgress size={18} />
              ) : (
                <RadioButtonUncheckedIcon
                  fontSize="small"
                  sx={{ color: 'text.disabled' }}
                />
              )}
            </ListItemIcon>
            <ListItemText
              primary={step.label}
              primaryTypographyProps={{
                color: isCurrent
                  ? 'text.primary'
                  : isCompleted
                    ? 'text.secondary'
                    : 'text.disabled',
                fontWeight: isCurrent ? 'medium' : 'normal',
              }}
            />
          </ListItem>
        );
      })}
    </List>
  </Paper>
)}
```

Den bestehenden Post-Login-Refresh-Block (Zeilen 101-128, `isSignedIn && isRefreshing`) ebenfalls durch die Steps-Anzeige ersetzen — die gleiche Logik oben deckt das bereits ab (über `isSignedIn && loginStep !== 'done'`). Den alten Block entfernen.

**Step 2: Verifizieren dass tsc kompiliert**

Run: `npx tsc --noEmit 2>&1 | head -20`
Expected: PASS

**Step 3: Manuell testen**

Run: `npm run dev`
- Öffne `/login`, logge dich ein
- Verifiziere: Steps werden nacheinander als Häkchen/Spinner/Grau angezeigt
- Verifiziere: Page-Reload zeigt ebenfalls die Steps

**Step 4: Commit**

```bash
git add src/components/pages/LoginUi.tsx
git commit -m "feat: show login progress steps in LoginUi"
```

---

## Task 4: Server-seitiger In-Memory-Cache für getUserSessionData

**Files:**
- Modify: `src/server/auth/autoProvisionUser.ts`
- Create: `src/server/auth/autoProvisionUser.test.ts`

**Step 1: Test schreiben**

Erstelle `src/server/auth/autoProvisionUser.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Test the cache utility directly
import { UserSessionCache } from './userSessionCache';

describe('UserSessionCache', () => {
  let cache: UserSessionCache;

  beforeEach(() => {
    cache = new UserSessionCache(1000); // 1s TTL for tests
  });

  it('returns undefined for unknown keys', () => {
    expect(cache.get('unknown')).toBeUndefined();
  });

  it('caches and returns data', () => {
    const data = { isAuthorized: true, isAdmin: false, groups: ['a'] };
    cache.set('uid1', data);
    expect(cache.get('uid1')).toEqual(data);
  });

  it('returns undefined after TTL expires', async () => {
    const data = { isAuthorized: true, isAdmin: false, groups: ['a'] };
    cache = new UserSessionCache(50); // 50ms TTL
    cache.set('uid1', data);
    await new Promise((r) => setTimeout(r, 60));
    expect(cache.get('uid1')).toBeUndefined();
  });

  it('invalidate removes entry', () => {
    const data = { isAuthorized: true, isAdmin: false, groups: ['a'] };
    cache.set('uid1', data);
    cache.invalidate('uid1');
    expect(cache.get('uid1')).toBeUndefined();
  });
});
```

**Step 2: Run test to verify it fails**

Run: `NO_COLOR=1 npx vitest run src/server/auth/autoProvisionUser.test.ts 2>&1 | tail -10`
Expected: FAIL (Module `./userSessionCache` not found)

**Step 3: Cache-Klasse implementieren**

Erstelle `src/server/auth/userSessionCache.ts`:

```typescript
import { AutoProvisionedUser } from './autoProvisionUser';

export class UserSessionCache {
  private cache = new Map<string, { data: AutoProvisionedUser; expires: number }>();
  private knownUsers = new Set<string>();

  constructor(private ttlMs: number = 60_000) {}

  get(uid: string): AutoProvisionedUser | undefined {
    const entry = this.cache.get(uid);
    if (entry && entry.expires > Date.now()) {
      return entry.data;
    }
    if (entry) {
      this.cache.delete(uid);
    }
    return undefined;
  }

  set(uid: string, data: AutoProvisionedUser): void {
    this.cache.set(uid, { data, expires: Date.now() + this.ttlMs });
    this.knownUsers.add(uid);
  }

  invalidate(uid: string): void {
    this.cache.delete(uid);
  }

  isKnownUser(uid: string): boolean {
    return this.knownUsers.has(uid);
  }

  markKnownUser(uid: string): void {
    this.knownUsers.add(uid);
  }
}

/** Singleton instance for server-side caching */
export const userSessionCache = new UserSessionCache();
```

**Step 4: Run test to verify it passes**

Run: `NO_COLOR=1 npx vitest run src/server/auth/autoProvisionUser.test.ts 2>&1 | tail -10`
Expected: PASS

**Step 5: Cache in getUserSessionData und ensureUserProvisioned einbauen**

In `autoProvisionUser.ts`:

Import hinzufügen:

```typescript
import { userSessionCache } from './userSessionCache';
```

`getUserSessionData` modifizieren — vor dem Firestore-Read den Cache prüfen:

```typescript
export async function getUserSessionData(
  uid: string,
  email: string | null | undefined,
  displayName?: string | null
): Promise<AutoProvisionedUser | undefined> {
  const timer = serverLoginTimer('getUserSessionData');

  // Check cache first
  const cached = userSessionCache.get(uid);
  if (cached) {
    timer.step('cache hit');
    timer.done();
    return cached;
  }

  timer.step('fetchUserDoc');
  const userInfo = await firestore
    .collection(USER_COLLECTION_ID)
    .doc(uid)
    .get();

  if (userInfo.exists) {
    const userData = userInfo.data() as FirebaseUserInfo;
    const result = {
      isAuthorized: !!userData.authorized,
      isAdmin: !!userData.isAdmin,
      groups: uniqueArray(['allUsers', ...(userData.groups || [])]),
      firecall: userData.firecall,
    };
    userSessionCache.set(uid, result);
    timer.done();
    return result;
  }

  if (isInternalEmail(email)) {
    timer.step('autoProvisionInternalUser');
    const result = await autoProvisionInternalUser(uid, email!, displayName);
    userSessionCache.set(uid, result);
    timer.done();
    return result;
  }

  timer.done();
  return undefined;
}
```

`ensureUserProvisioned` modifizieren — `knownUsers`-Set nutzen:

```typescript
export async function ensureUserProvisioned(
  uid: string,
  email: string | null | undefined,
  displayName?: string | null
): Promise<void> {
  const timer = serverLoginTimer('ensureUserProvisioned');

  if (!isInternalEmail(email)) {
    timer.done();
    return;
  }

  // Skip Firestore read if user is already known
  if (userSessionCache.isKnownUser(uid)) {
    timer.step('known user (cached)');
    timer.done();
    return;
  }

  timer.step('fetchUserDoc');
  const userInfo = await firestore
    .collection(USER_COLLECTION_ID)
    .doc(uid)
    .get();

  if (userInfo.exists) {
    userSessionCache.markKnownUser(uid);
    timer.done();
    return;
  }

  timer.step('autoProvisionInternalUser');
  await autoProvisionInternalUser(uid, email!, displayName);
  userSessionCache.markKnownUser(uid);
  timer.done();
}
```

In `autoProvisionInternalUser`: Cache invalidieren nach Provisioning (damit frische Daten geladen werden):

```typescript
// Am Ende von autoProvisionInternalUser, vor dem return:
userSessionCache.invalidate(uid);
```

**Step 6: Alle Tests laufen lassen**

Run: `NO_COLOR=1 npx vitest run 2>&1 | tail -15`
Expected: Alle Tests PASS

**Step 7: Commit**

```bash
git add src/server/auth/userSessionCache.ts src/server/auth/autoProvisionUser.ts src/server/auth/autoProvisionUser.test.ts
git commit -m "perf: add server-side in-memory cache for user session data"
```

---

## Task 5: Stale-While-Revalidate bei Page-Reload

**Files:**
- Modify: `src/hooks/useFirebaseLoginObserver.ts`

**Step 1: serverLogin bei gültiger Session überspringen**

Im `onAuthStateChanged`-Handler: Wenn der `sessionStatus` bereits `'authenticated'` ist und ein gültiger SessionStorage-Cache vorliegt, den vollen `serverLogin()` + `getIdToken(true)` Roundtrip überspringen.

Dazu eine neue Ref einführen die den `sessionStatus` trackt (damit er im Callback verfügbar ist):

```typescript
const sessionStatusRef = useRef(sessionStatus);
useEffect(() => {
  sessionStatusRef.current = sessionStatus;
}, [sessionStatus]);
```

Im `onAuthStateChanged`-Handler den Block `if (token) { ... }` ersetzen:

```typescript
if (token) {
  const hasValidSession = sessionStatusRef.current === 'authenticated';

  if (hasValidSession) {
    // Skip full server roundtrip — session cookie is still valid
    timer.step('skip serverLogin (session valid)');
  } else {
    setLoginStatus((prev) => ({ ...prev, loginStep: 'verifying' }));
    timer.step('serverLogin');
    await serverLoginRef.current();
  }

  // Only force-refresh token if no valid session (fresh login)
  if (!hasValidSession) {
    timer.step('getIdToken (force refresh)');
    await user.getIdToken(true);
  }
}
```

**Step 2: Verifizieren dass tsc kompiliert**

Run: `npx tsc --noEmit 2>&1 | head -20`
Expected: PASS

**Step 3: Manuell testen**

Run: `npm run dev`
- Login durchführen (volle Steps sichtbar)
- Page-Reload → Login sollte deutlich schneller sein (kein `serverLogin`)
- In Browser-Console filtern nach `[login-timing]`:
  - `skip serverLogin (session valid)` soll in den Logs erscheinen
  - Gesamtzeit sollte unter 500ms liegen

**Step 4: Commit**

```bash
git add src/hooks/useFirebaseLoginObserver.ts
git commit -m "perf: skip serverLogin on page reload when session is valid"
```

---

## Task 6: Stale-While-Revalidate bei Gruppen-Änderung

**Files:**
- Modify: `src/hooks/useFirebaseLoginObserver.ts`

**Step 1: Firestore-Snapshot-Daten sofort in UI übernehmen**

Im `onSnapshot`-Handler (der `authChanged`-Block): Statt zuerst `refreshTokenWithRetry` abzuwarten, sofort den UI-State aktualisieren und den Token-Refresh im Hintergrund machen.

Ersetze den `if (authChanged && auth.currentUser)` Block:

```typescript
if (authChanged && auth.currentUser) {
  console.info(`credentials changed by admin, refreshing token and session`);
  lastKnownAuthRef.current = currentAuth;

  // Immediately update UI with Firestore snapshot data
  setLoginStatus((prev) => ({
    ...prev,
    isAuthorized: currentAuth.authorized ?? prev.isAuthorized,
    groups: currentAuth.groups ?? prev.groups,
  }));
  setCredentialsRefreshed(true);
  setNeedsReLogin(false);

  // Background: refresh token and server session (non-blocking)
  (async () => {
    try {
      const refreshed = await refreshTokenWithRetry(
        currentAuth.authorized!,
        currentAuth.groups!
      );
      if (refreshed) {
        await serverLogin();
        await refresh();
      } else {
        console.warn('token claims still differ after background refresh');
        setNeedsReLogin(true);
      }
    } catch (err) {
      console.error('failed to refresh credentials after admin update', err);
      setNeedsReLogin(true);
    }
  })();
}
```

**Step 2: Verifizieren dass tsc kompiliert**

Run: `npx tsc --noEmit 2>&1 | head -20`
Expected: PASS

**Step 3: Manuell testen**

- Einloggen mit User A
- In Firebase Console oder Admin-UI: Gruppe zu User A hinzufügen
- Verifiziere: UI aktualisiert sofort (neue Gruppe sichtbar), Snackbar erscheint
- Verifiziere: Kein 5-Sekunden-Block mehr

**Step 4: Commit**

```bash
git add src/hooks/useFirebaseLoginObserver.ts
git commit -m "perf: immediately show group changes from Firestore snapshot, refresh token in background"
```

---

## Task 7: Debug-Timing aus dem bestehenden Worktree übernehmen

**Files:**
- Die Datei `src/common/loginTiming.ts` sowie alle Timing-Instrumentierungen aus dem `debug-login-timing` Worktree müssen in diesen Branch übernommen werden (sie sind bereits vorhanden, da wir im gleichen Worktree arbeiten).

**Step 1: Verifizieren dass loginTiming.ts vorhanden ist**

Run: `ls src/common/loginTiming.ts`
Expected: Datei existiert

**Step 2: Commit (falls noch nicht committed)**

```bash
git add src/common/loginTiming.ts
git commit -m "feat: add login timing debug utility for production diagnostics"
```

---

## Task 8: Final Check

**Step 1: Alle Checks laufen lassen**

Run: `npm run check`
Expected: tsc PASS, lint PASS, tests PASS, build PASS

**Step 2: Manuell End-to-End testen**

1. **Erster Login:** Steps-Anzeige verifizieren (authenticating → verifying → loading_permissions → done)
2. **Page-Reload:** Schneller Login (~300ms), `skip serverLogin` in Logs
3. **Gruppen-Änderung:** Sofort in UI sichtbar
4. **Logout + Re-Login:** Voller Flow wieder
5. **Production-Timing:** `[login-timing]` und `[login-timing:server]` Logs prüfen

**Step 3: Alle Änderungen committen falls nötig**

```bash
git add -A
git commit -m "chore: final cleanup for login performance optimization"
```
