# Login Performance Optimization

## Problem

Der Login dauert ~3.5 Sekunden. Hauptursachen:
- Bei Page-Reload wird `serverLogin()` aufgerufen obwohl eine gültige NextAuth-Session existiert (~1000ms)
- `verifyIdToken` + `ensureUserProvisioned` bei jedem Login (~935ms)
- `getUserSessionData` liest bei jedem `/api/auth/session`-Aufruf Firestore (~70ms × mehrfach)
- `getIdToken(true)` Force-Refresh bei jedem `onAuthStateChanged` (~177ms)
- Gruppen-Änderungen blockieren die UI mit bis zu 5 Retry-Loops (max 5s)

## Design

### 1. Login-Status-Feedback in LoginUi

Ersetze den generischen Spinner in `LoginUi.tsx` durch eine Schritt-Checkliste:

**Steps:**
1. "Google Login wird durchgeführt..." / "Email Login wird durchgeführt..."
2. "Anmeldung wird verifiziert..."
3. "Berechtigungen werden geladen..."
4. "Fertig"

**Umsetzung:**
- Neuer State `loginStep` als String-Enum in `useFirebaseLoginObserver`: `idle | authenticating | verifying | loading_permissions | done`
- `loginStep` wird an den entsprechenden Stellen im Auth-Flow gesetzt
- `LoginUi.tsx` zeigt die Steps als Liste mit:
  - `CheckCircleIcon` (grün) — abgeschlossen
  - `CircularProgress` (size 20) — aktuell
  - `RadioButtonUncheckedIcon` (grau) — ausstehend
- Bei Page-Reload mit gecachten Daten: "Gespeicherte Anmeldung wird geladen..."

### 2. Stale-While-Revalidate bei Page-Reload

Wenn `sessionStatus === 'authenticated'` und gültige Session-Storage-Daten vorhanden:
- `serverLogin()` wird NICHT aufgerufen (spart ~1000ms)
- `getIdToken(true)` Force-Refresh wird NICHT aufgerufen (spart ~177ms)
- Nur `getMyGroupsFromServer()` und leichter Hintergrund-Refresh
- Bei Token-Ablauf (< 5 Min) wird im Hintergrund ein `serverLogin()` gemacht

### 3. Stale-While-Revalidate bei Gruppen-Änderung

Wenn der Firestore `onSnapshot`-Handler neue Gruppen erkennt:
- **Sofort:** UI-State mit den Daten aus dem Snapshot aktualisieren (`groups`, `authorized` direkt setzen)
- **Sofort:** Snackbar "Berechtigungen aktualisiert"
- **Hintergrund:** Token-Refresh + `serverLogin()` non-blocking, ohne Retry-Delays
- Falls Token-Refresh fehlschlägt: `needsReLogin` setzen wie bisher

### 4. Server-seitiger In-Memory-Cache für `getUserSessionData`

In `autoProvisionUser.ts`:
- `Map<string, { data: AutoProvisionedUser; expires: number }>` mit 60s TTL
- Wird bei `autoProvisionInternalUser()` invalidiert
- Reduziert ~70ms Firestore-Read pro `/api/auth/session` auf ~0ms (nach erstem Call)

### 5. Server-seitiger Cache für `ensureUserProvisioned`

- `Set<string>` mit bekannten UIDs (kein TTL nötig, User wird nur einmal provisioniert)
- Spart den Firestore-Read (~328ms) bei bekannten Usern im `authorize`-Callback
- Wird beim Server-Restart automatisch geleert

### 6. Debug-Timing beibehalten

Das `[login-timing]` / `[login-timing:server]` Logging aus dem bestehenden Worktree bleibt erhalten und hilft auch in Production.

## Erwartete Verbesserungen

| Szenario | Vorher | Nachher |
|----------|--------|---------|
| Erster Login | ~3500ms | ~2000ms (Server-Caches) |
| Page-Reload (Session gültig) | ~3500ms | ~300ms (kein serverLogin) |
| Gruppen-Änderung | ~1-6s blockierend | sofort (UI), Hintergrund-Sync |
| Session-Callback | ~70ms/Aufruf | ~0ms (nach erstem Call) |

## Betroffene Dateien

- `src/hooks/useFirebaseLoginObserver.ts` — loginStep State, Reload-Optimierung, Gruppen-SWR
- `src/hooks/auth/types.ts` — LoginStep-Typ erweitern
- `src/components/pages/LoginUi.tsx` — Step-Anzeige UI
- `src/server/auth/autoProvisionUser.ts` — In-Memory-Caches
- `src/app/auth.ts` — ensureUserProvisioned-Cache im authorize-Callback
- `src/common/loginTiming.ts` — bereits implementiert (Worktree debug-login-timing)
