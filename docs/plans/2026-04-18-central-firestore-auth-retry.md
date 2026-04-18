# Central Firestore Auth-Retry Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Alle clientseitigen Firestore-Schreibvorgänge laufen zentral über einen Wrapper, der nach Token-Ablauf (z. B. nach Standby) automatisch re-authentifiziert und den Aufruf einmalig wiederholt – ohne dass jede Call-Site das selbst tun muss.

**Architecture:** Ein Modul `src/lib/firestoreClient.ts` re-exportiert alle Mutation-Funktionen aus `firebase/firestore` (`setDoc`, `updateDoc`, `addDoc`, `deleteDoc`) sowie einen Wrapper für `writeBatch().commit()` und `runTransaction()`. Jede Funktion ist in `withFreshAuth` eingebettet (proaktives `ensureFreshAuth` + einmaliger Retry bei Auth-Error). ESLint `no-restricted-imports` verhindert, dass neue Call-Sites an dem Wrapper vorbei direkt aus `firebase/firestore` importieren. PR #500 wird damit ergänzt, nicht ersetzt: `ensureFreshAuth`/`withFreshAuth` bleiben Grundlage.

**Tech Stack:** TypeScript, Firebase Web SDK (modular v9+), Vitest, ESLint.

**Vorbedingung:** Dieser Plan baut auf PR #500 auf. Entweder zuerst PR #500 mergen, oder diesen Branch auf `fix/auto-renew-auth-after-standby` rebasen.

---

## Ausgangslage

Client-seitige Firestore-Writes im Code:

| Datei | Writes |
|---|---|
| `src/hooks/useFirecallItemAdd.ts` | addDoc (via withFreshAuth in PR #500) |
| `src/hooks/useFirecallItemUpdate.ts` | setDoc (teils withFreshAuth) + writeBatch(2x) |
| `src/hooks/useKostenersatzMutations.ts` | setDoc, updateDoc, deleteDoc, writeBatch(4x) |
| `src/hooks/firecallHistory/useSaveHistory.ts` | writeBatch |
| `src/hooks/copyLayer.ts` | writeBatch |
| `src/hooks/useExport.ts` | writeBatch (chunked, 500er-Limit) |
| `src/hooks/useFirecallLocations.ts` | setDoc/updateDoc |
| `src/hooks/useAuditLog.ts` | addDoc |
| `src/hooks/useCrewAssignments.ts` | setDoc/updateDoc/deleteDoc |
| `src/hooks/useKostenersatzEmailConfig.ts` | setDoc |
| `src/hooks/useKostenersatz.ts` | updateDoc |
| `src/hooks/useKostenersatzVehicles.ts` | setDoc |
| `src/hooks/useDrawingStrokes.ts` | setDoc |
| `src/components/Map/Drawing/DrawingContext.tsx` | writeBatch |
| `src/components/Map/Leitungen/context.tsx` | setDoc/updateDoc/deleteDoc |
| `src/components/FirecallItems/FirecallItemDialog.tsx` | setDoc/updateDoc |
| `src/components/FirecallItems/FirecallItemCard.tsx` | updateDoc |
| `src/components/FirecallItems/EinsatzDialog.tsx` | setDoc |
| `src/components/FirecallItems/elements/marker/FirecallItemDefault.tsx` | updateDoc |
| `src/components/FirecallItems/elements/area/areaFunctions.ts` | updateDoc |
| `src/components/FirecallItems/elements/connection/positions.ts` | updateDoc |
| `src/components/Map/markers/FirecallMarker.tsx` | updateDoc |
| `src/components/Map/Clusters.tsx` | updateDoc |
| `src/components/site/HistoryDialog.tsx` | updateDoc |
| `src/components/pages/Tokens.tsx` | addDoc/deleteDoc |
| `src/components/pages/Einsaetze.tsx` | addDoc |
| `src/components/pages/EinsatzDetails.tsx` | updateDoc |
| `src/components/pages/Geschaeftsbuch.tsx` | updateDoc |
| `src/components/chat/messages.tsx` | addDoc |

Insgesamt **~95 Write-Call-Sites** in **~30 Dateien**. Kein `runTransaction` im Client-Code. `writeBatch` wird **8×** verwendet (inkl. chunked in `useExport.ts`).

**Server-seitiger Admin-SDK-Code (z. B. `src/server/**`, `src/app/api/**`) ist ausgeklammert** – dort wird kein User-Token verwendet, keine Standby-Problematik.

---

## Sonderfälle

1. **`writeBatch`:** Der Wrap muss um `batch.commit()` liegen, nicht um `writeBatch()`. Die Batch-Erstellung ist rein lokal. Reihenfolge: `const batch = writeBatch(firestore); batch.set(...); await commitBatch(batch);`
2. **`useExport.ts` (chunked batch):** Jeder Chunk ruft `commit()` separat. Jeder Commit wird einzeln gewrapped – ein Retry refresht Auth und führt **nur den fehlgeschlagenen Chunk** erneut aus (die vorher erfolgreich committeten Chunks bleiben geschrieben). Dokumentieren!
3. **Reads (`getDoc`, `getDocs`):** Nicht Teil dieses Plans. Reads mit abgelaufenem Token werfen ebenfalls Auth-Errors, aber UI-Feedback ist anders (keine Daten-Verlust-Sorge). **Entscheidung: Reads auch wrappen**, analoges Modul, aber geringere Priorität – als optionale Phase 5 dokumentiert, hier nicht umgesetzt.
4. **`getDoc` direkt vor einem `setDoc` (Read-modify-write):** Wenn `getDoc` vor einem `setDoc` im selben Operation-Block steht und der Read vor dem Refresh scheitert, ist das problematisch. **Lösung:** Caller wrappen den gesamten Block mit `withFreshAuth(() => { ... })` (weiterhin verfügbar für zusammengesetzte Operationen). Das zentrale Modul erleichtert Einzel-Ops, ersetzt aber `withFreshAuth` für Multi-Step-Logik nicht.
5. **NextAuth-Session vs. Firebase-Auth:** `ensureFreshAuth` synct beides (siehe PR #500). Der Retry-Pfad nutzt `forceServerLogin=true`, wodurch auch die NextAuth-Session neu gesetzt wird. **Caveat:** Der Bug in `ensureFreshAuth` (Dedup ignoriert `forceServerLogin`) muss zuerst gefixt werden, sonst kann der Retry gegen eine alte Inflight-Promise laufen.

---

## Task 0: `ensureFreshAuth` Dedup-Bug fixen (Vorbedingung)

**Warum zuerst:** Ohne diesen Fix kann der `withFreshAuth`-Retry beim Aufruf während einer laufenden `ensureFreshAuth(false)`-Operation das `forceServerLogin=true` verlieren und den Retry entwerten.

**Files:**
- Modify: `src/hooks/auth/ensureFreshAuth.ts`
- Test: `src/hooks/auth/ensureFreshAuth.test.ts`

**Step 1: Failing Test schreiben**

In `ensureFreshAuth.test.ts` folgenden Test ergänzen:

```ts
it('does not reuse an inflight non-forced call for a forced caller', async () => {
  const user = makeUser(4 * 60 * 1000); // 4min → needs refresh
  mockAuth.currentUser = user;
  firebaseTokenLoginMock.mockResolvedValue({ ok: true });

  const [first, second] = await Promise.all([
    ensureFreshAuth(false),
    ensureFreshAuth(true),
  ]);

  expect(first).toBe(true);
  expect(second).toBe(true);
  // Forced caller muss einen server-login gesehen haben
  expect(firebaseTokenLoginMock).toHaveBeenCalled();
});
```

Zusätzlicher Test für den expliziten Fall, dass nur der erste Call force=false ist und `firebaseTokenLogin` NICHT aufgerufen wurde, aber der zweite (force=true) doch zu einem Login führt:

```ts
it('forces server login when a later caller requests it during inflight', async () => {
  const user = makeUser(10 * 60 * 1000); // 10min → kein Refresh nötig
  mockAuth.currentUser = user;
  firebaseTokenLoginMock.mockResolvedValue({ ok: true });

  const p1 = ensureFreshAuth(false); // würde alleine keinen Login machen
  const p2 = ensureFreshAuth(true);  // erzwingt Login

  await Promise.all([p1, p2]);
  expect(firebaseTokenLoginMock).toHaveBeenCalled();
});
```

**Step 2: Test laufen lassen (muss failen)**

```bash
NO_COLOR=1 npm run test -- src/hooks/auth/ensureFreshAuth.test.ts
```

Erwartet: beide neuen Tests fail, weil der zweite Caller die Inflight-Promise des ersten zurückbekommt.

**Step 3: Fix implementieren**

`ensureFreshAuth` bekommt zwei Inflight-Slots – einen für `force=false`, einen für `force=true`. Wenn ein Force-Caller eintrifft während eine non-force-Promise läuft, wird eine neue Force-Promise gestartet (läuft parallel). Wenn eine Force-Promise läuft, wird sie auch von non-force-Callern gewiedet (Force ist strikter).

```ts
let inflightAny: Promise<boolean> | null = null;
let inflightForce: Promise<boolean> | null = null;

export async function ensureFreshAuth(
  forceServerLogin = false,
): Promise<boolean> {
  if (forceServerLogin) {
    if (inflightForce) return inflightForce;
    inflightForce = doEnsure(true).catch((err) => {
      console.error('ensureFreshAuth failed', err);
      return false;
    });
    try {
      return await inflightForce;
    } finally {
      inflightForce = null;
    }
  }

  // Non-force callers ride on a force promise if one is running.
  if (inflightForce) return inflightForce;
  if (inflightAny) return inflightAny;
  inflightAny = doEnsure(false).catch((err) => {
    console.error('ensureFreshAuth failed', err);
    return false;
  });
  try {
    return await inflightAny;
  } finally {
    inflightAny = null;
  }
}
```

**Step 4: Tests erneut laufen lassen**

```bash
NO_COLOR=1 npm run test -- src/hooks/auth/ensureFreshAuth.test.ts
```

Erwartet: alle Tests grün.

**Step 5: Commit**

```bash
git add src/hooks/auth/ensureFreshAuth.ts src/hooks/auth/ensureFreshAuth.test.ts
git commit -m "fix(auth): honor forceServerLogin during inflight ensureFreshAuth"
```

---

## Task 1: Zentrales Wrapper-Modul `firestoreClient.ts`

**Files:**
- Create: `src/lib/firestoreClient.ts`
- Create: `src/lib/firestoreClient.test.ts`

**Step 1: Failing Tests schreiben**

```ts
// firestoreClient.test.ts
import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  setDoc: vi.fn(),
  updateDoc: vi.fn(),
  addDoc: vi.fn(),
  deleteDoc: vi.fn(),
  withFreshAuth: vi.fn(),
}));

vi.mock('firebase/firestore', () => ({
  setDoc: hoisted.setDoc,
  updateDoc: hoisted.updateDoc,
  addDoc: hoisted.addDoc,
  deleteDoc: hoisted.deleteDoc,
  // passthrough for helpers we don't wrap
  doc: vi.fn(),
  collection: vi.fn(),
  writeBatch: vi.fn(),
}));

vi.mock('@/hooks/auth/withFreshAuth', () => ({
  withFreshAuth: hoisted.withFreshAuth,
}));

import { setDoc, updateDoc, addDoc, deleteDoc, commitBatch } from './firestoreClient';

describe('firestoreClient', () => {
  beforeEach(() => {
    Object.values(hoisted).forEach((m) => m.mockReset?.());
    hoisted.withFreshAuth.mockImplementation((op) => op());
  });

  it('setDoc goes through withFreshAuth', async () => {
    hoisted.setDoc.mockResolvedValue('ok');
    await setDoc('ref' as any, { a: 1 });
    expect(hoisted.withFreshAuth).toHaveBeenCalledTimes(1);
    expect(hoisted.setDoc).toHaveBeenCalledWith('ref', { a: 1 });
  });

  it('updateDoc goes through withFreshAuth', async () => {
    hoisted.updateDoc.mockResolvedValue('ok');
    await updateDoc('ref' as any, { a: 1 });
    expect(hoisted.withFreshAuth).toHaveBeenCalledTimes(1);
  });

  it('addDoc goes through withFreshAuth', async () => {
    hoisted.addDoc.mockResolvedValue({ id: 'x' });
    await addDoc('coll' as any, { a: 1 });
    expect(hoisted.withFreshAuth).toHaveBeenCalledTimes(1);
  });

  it('deleteDoc goes through withFreshAuth', async () => {
    hoisted.deleteDoc.mockResolvedValue(undefined);
    await deleteDoc('ref' as any);
    expect(hoisted.withFreshAuth).toHaveBeenCalledTimes(1);
  });

  it('commitBatch wraps batch.commit()', async () => {
    const batch = { commit: vi.fn().mockResolvedValue(undefined) } as any;
    await commitBatch(batch);
    expect(hoisted.withFreshAuth).toHaveBeenCalledTimes(1);
    expect(batch.commit).toHaveBeenCalledTimes(1);
  });
});
```

**Step 2: Test laufen lassen (muss failen)**

```bash
NO_COLOR=1 npm run test -- src/lib/firestoreClient.test.ts
```

Erwartet: Modul existiert nicht → fail.

**Step 3: Wrapper implementieren**

```ts
// src/lib/firestoreClient.ts
'use client';

import {
  setDoc as fsSetDoc,
  updateDoc as fsUpdateDoc,
  addDoc as fsAddDoc,
  deleteDoc as fsDeleteDoc,
  type DocumentReference,
  type CollectionReference,
  type DocumentData,
  type SetOptions,
  type UpdateData,
  type WithFieldValue,
  type WriteBatch,
  type PartialWithFieldValue,
} from 'firebase/firestore';
import { withFreshAuth } from '@/hooks/auth/withFreshAuth';

export function setDoc<T>(
  reference: DocumentReference<T>,
  data: WithFieldValue<T>,
): Promise<void>;
export function setDoc<T>(
  reference: DocumentReference<T>,
  data: PartialWithFieldValue<T>,
  options: SetOptions,
): Promise<void>;
export function setDoc(reference: any, data: any, options?: any): Promise<void> {
  return withFreshAuth(() =>
    options === undefined
      ? fsSetDoc(reference, data)
      : fsSetDoc(reference, data, options),
  );
}

export function updateDoc<T, U>(
  reference: DocumentReference<T, U>,
  data: UpdateData<U>,
): Promise<void>;
export function updateDoc(reference: any, data: any): Promise<void> {
  return withFreshAuth(() => fsUpdateDoc(reference, data));
}

export function addDoc<T, U>(
  reference: CollectionReference<T, U>,
  data: WithFieldValue<U>,
): Promise<DocumentReference<T, U>> {
  return withFreshAuth(() => fsAddDoc(reference, data));
}

export function deleteDoc(reference: DocumentReference<any>): Promise<void> {
  return withFreshAuth(() => fsDeleteDoc(reference));
}

/**
 * Wrap a writeBatch.commit() through withFreshAuth.
 * Local batch assembly (batch.set, batch.update, batch.delete) stays unwrapped
 * because those are synchronous and not network-bound.
 */
export function commitBatch(batch: WriteBatch): Promise<void> {
  return withFreshAuth(() => batch.commit());
}
```

**Step 4: Tests laufen lassen**

```bash
NO_COLOR=1 npm run test -- src/lib/firestoreClient.test.ts
```

Erwartet: grün.

**Step 5: Commit**

```bash
git add src/lib/firestoreClient.ts src/lib/firestoreClient.test.ts
git commit -m "feat(firestore): add central write wrapper with auth retry"
```

---

## Task 2: ESLint-Regel `no-restricted-imports` aktivieren

Verhindert, dass neue Call-Sites direkt aus `firebase/firestore` schreiben.

**Files:**
- Modify: `eslint.config.mjs` (oder `.eslintrc.*`, je nach Projekt-Setup)

**Step 1: Aktuelle ESLint-Konfiguration lesen**

```bash
cat eslint.config.mjs 2>/dev/null || cat .eslintrc.json 2>/dev/null
```

**Step 2: Regel hinzufügen**

In der ESLint-Config folgenden Regel-Block ergänzen (Pfade `src/lib/firestoreClient.ts` und `src/hooks/auth/*` sind ausgenommen, damit dort weiterhin die Original-SDK importiert werden darf):

```js
rules: {
  'no-restricted-imports': [
    'error',
    {
      paths: [
        {
          name: 'firebase/firestore',
          importNames: ['setDoc', 'updateDoc', 'addDoc', 'deleteDoc'],
          message:
            "Import from '@/lib/firestoreClient' instead to get automatic auth retry. " +
            "For writeBatch, use commitBatch from '@/lib/firestoreClient'.",
        },
      ],
    },
  ],
}
```

Plus eine `overrides` / file-pattern-Ausnahme für `src/lib/firestoreClient.ts` selbst (damit das Modul die originale API importieren darf).

**Step 3: Lint laufen lassen – zeigt alle unumgesetzten Imports**

```bash
npm run lint 2>&1 | tee /tmp/lint-baseline.txt
```

Erwartet: viele Fehler (alle Call-Sites, die noch nicht umgestellt sind). Das ist die **Arbeitsliste** für Tasks 3–N.

**Step 4: Commit erst am Ende des Migrationsprozesses**

Regel bleibt im Working-Tree. Wenn Lint in CI zu vielen Errors führt, die Regel temporär `warn` setzen und erst in Task N+1 auf `error` hochstufen.

```bash
git add eslint.config.mjs
git commit -m "chore(lint): forbid direct firestore write imports"
```

---

## Tasks 3–N: Migrations-Tasks pro Datei/Feature-Gruppe

Jeder Migrations-Task folgt demselben Schema:

**Pro Datei:**
1. Imports umstellen von `firebase/firestore` auf `@/lib/firestoreClient`
2. `writeBatch`-Aufrufe: Batch-Erstellung bleibt (`writeBatch(firestore)`), aber `batch.commit()` wird durch `commitBatch(batch)` ersetzt
3. Ggf. vorhandenes `withFreshAuth(() => setDoc(...))` direkt auf `setDoc(...)` reduzieren, weil der Wrapper jetzt zentral ist
4. `npm run test` für betroffene Test-Dateien
5. Commit

**Aufteilung nach Feature-Gruppen** (ein Commit je Gruppe, damit die PRs klein bleiben):

### Task 3: Firecall-Items (Cleanup + Cascade-Fix)

- Modify: `src/hooks/useFirecallItemAdd.ts` – `withFreshAuth` entfernen, zentral durch neuen `addDoc` ersetzen
- Modify: `src/hooks/useFirecallItemUpdate.ts` – `withFreshAuth` entfernen, `setDoc` direkt; **beide `writeBatch.commit()` auf `commitBatch` umstellen** (das ist der Cascade-Bug aus dem Review!)
- Modify: `src/components/FirecallItems/FirecallItemDialog.tsx`
- Modify: `src/components/FirecallItems/FirecallItemCard.tsx`
- Modify: `src/components/FirecallItems/EinsatzDialog.tsx`
- Modify: `src/components/FirecallItems/elements/marker/FirecallItemDefault.tsx`
- Modify: `src/components/FirecallItems/elements/area/areaFunctions.ts`
- Modify: `src/components/FirecallItems/elements/connection/positions.ts`
- Modify: `src/components/Map/markers/FirecallMarker.tsx`

Commit: `refactor(firestore): route firecall-item writes through central client`

### Task 4: Drawing / Leitungen

- Modify: `src/components/Map/Drawing/DrawingContext.tsx` (writeBatch → commitBatch)
- Modify: `src/components/Map/Leitungen/context.tsx`
- Modify: `src/hooks/useDrawingStrokes.ts`

Commit: `refactor(firestore): route drawing/leitung writes through central client`

### Task 5: Kostenersatz

- Modify: `src/hooks/useKostenersatzMutations.ts` (4× writeBatch → commitBatch)
- Modify: `src/hooks/useKostenersatz.ts`
- Modify: `src/hooks/useKostenersatzEmailConfig.ts`
- Modify: `src/hooks/useKostenersatzVehicles.ts`

Commit: `refactor(firestore): route kostenersatz writes through central client`

### Task 6: History / Audit / Einsatztagebuch

- Modify: `src/hooks/firecallHistory/useSaveHistory.ts` (writeBatch → commitBatch)
- Modify: `src/hooks/useAuditLog.ts`
- Modify: `src/components/site/HistoryDialog.tsx`

Commit: `refactor(firestore): route history/audit writes through central client`

### Task 7: Mannschaft / Crew / Standorte

- Modify: `src/hooks/useCrewAssignments.ts`
- Modify: `src/hooks/useFirecallLocations.ts`
- Modify: `src/hooks/copyLayer.ts` (writeBatch → commitBatch)

Commit: `refactor(firestore): route crew/location writes through central client`

### Task 8: Seiten / Einsatz-Verwaltung

- Modify: `src/components/pages/Einsaetze.tsx`
- Modify: `src/components/pages/EinsatzDetails.tsx`
- Modify: `src/components/pages/Geschaeftsbuch.tsx`
- Modify: `src/components/pages/Tokens.tsx`

Commit: `refactor(firestore): route page-level writes through central client`

### Task 9: Map / Clusters / Chat

- Modify: `src/components/Map/Clusters.tsx`
- Modify: `src/components/chat/messages.tsx`

Commit: `refactor(firestore): route map/chat writes through central client`

### Task 10: Export (chunked writeBatch)

Sonderfall dokumentieren:

- Modify: `src/hooks/useExport.ts` – jeden Chunk-Commit durch `commitBatch` ersetzen
- Kommentar ergänzen: "Bei einem Auth-Error werden bereits committete Chunks NICHT zurückgerollt; nur der fehlgeschlagene Chunk wird retried."

Commit: `refactor(firestore): route chunked export batch commits through central client`

---

## Task N+1: ESLint-Regel auf `error` hochstufen (falls zuvor `warn`)

```bash
npm run lint
```

Erwartet: 0 Fehler, 0 Warnungen.

Commit: `chore(lint): enforce central firestore import rule`

---

## Task N+2: Integration-Test (optional, aber empfohlen)

End-to-End-ähnlicher Test, der simuliert:
1. Token ist abgelaufen
2. Schreiboperation startet
3. Erster Call wirft `permission-denied`
4. `ensureFreshAuth(true)` wird getriggert, liefert neuen Token
5. Retry gelingt

**Files:**
- Create: `src/lib/firestoreClient.integration.test.ts`

**Step 1: Test schreiben**

```ts
it('retries a write after an auth error with fresh auth', async () => {
  const authErr = Object.assign(new Error('unauthenticated'), {
    code: 'permission-denied',
  });
  hoisted.setDoc
    .mockRejectedValueOnce(authErr)
    .mockResolvedValueOnce(undefined);
  // withFreshAuth-Mock-Verhalten: beim zweiten Durchlauf nachdem
  // ensureFreshAuth(true) aufgerufen wurde, op() noch mal ausführen
  hoisted.withFreshAuth.mockImplementation(async (op) => {
    try {
      return await op();
    } catch (err) {
      if ((err as any).code === 'permission-denied') return await op();
      throw err;
    }
  });

  await setDoc('ref' as any, { a: 1 });
  expect(hoisted.setDoc).toHaveBeenCalledTimes(2);
});
```

**Step 2: Test laufen lassen**

```bash
NO_COLOR=1 npm run test -- src/lib/firestoreClient.integration.test.ts
```

Erwartet: grün.

**Step 3: Commit**

```bash
git add src/lib/firestoreClient.integration.test.ts
git commit -m "test(firestore): verify central client retries on auth error"
```

---

## Task N+3: `npm run check` + PR öffnen

**Step 1: Full Check**

```bash
npm run check
```

Muss ohne Fehler/Warnings durchlaufen.

**Step 2: Branch pushen**

```bash
git push -u origin feature/central-firestore-auth-retry
```

**Step 3: PR öffnen**

```bash
GITHUB_TOKEN= gh pr create --title "feat(firestore): central auth-retry wrapper for all writes" --body "$(cat <<'EOF'
## Zusammenfassung

Ergänzt PR #500 um einen zentralen Firestore-Write-Wrapper. Alle Mutation-Aufrufe (`setDoc`, `updateDoc`, `addDoc`, `deleteDoc`, `commitBatch`) laufen jetzt durch `@/lib/firestoreClient`, der `withFreshAuth` intern anwendet. Damit greift Auto-Renew und Retry nach Standby auf **allen** Schreibpfaden, nicht nur auf Firecall-Item-Add/Update.

## Änderungen

- Neues Modul `src/lib/firestoreClient.ts` + Tests
- Fix in `ensureFreshAuth`: `forceServerLogin` wird jetzt auch bei Inflight-Dedup respektiert (verhindert, dass ein Retry den Force-Flag verliert)
- ESLint-Regel `no-restricted-imports` verhindert direkten SDK-Write-Import in neuem Code
- Alle ~95 Client-Write-Call-Sites umgestellt
- Alle `writeBatch().commit()`-Aufrufe laufen über `commitBatch()` (8 Stellen)

## Test plan

- [ ] `npm run check` grün
- [ ] Nach 30 Min Standby: Einsatztagebuch-Eintrag hinzufügen funktioniert ohne Reload
- [ ] Nach 30 Min Standby: Kostenersatz-Update funktioniert
- [ ] Nach 30 Min Standby: Layer löschen (Cascade) funktioniert
- [ ] Nach 30 Min Standby: Drawing speichern funktioniert
- [ ] Snackbar-Reload-Aktion erscheint bei nicht-retrybaren Fehlern

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

---

## Risiken & Abwägungen

- **Großer Umbau (~30 Dateien).** Mitigation: Feature-Gruppen-Commits, jeder Commit für sich grün.
- **Wrapper-Overhead pro Call:** `ensureFreshAuth()` ohne Force ist billig (Expiry-Check + Inflight-Dedup), aber wird jetzt vor jedem Write ausgeführt. Erwarteter Extra-Aufwand: < 1 ms pro Call, kein Netzwerk-Roundtrip wenn Token frisch.
- **Firebase Admin SDK (Server):** Nicht betroffen – Admin SDK verwendet Service-Account-Credentials, kein User-Token. Kein Wrapper nötig.
- **Reads nicht abgedeckt:** Bewusste Scope-Reduktion. Reads mit abgelaufenem Token sind seltener problematisch (User sieht "keine Daten" statt "Daten verloren"). Kann in Folge-PR ergänzt werden.
- **Multi-Step Read-modify-write:** Zentrales Modul hilft nicht bei zusammengesetzten Operationen (z. B. `getDoc` → Logik → `setDoc`). Dort bleibt manuelles `withFreshAuth(() => { ... })` um den Block. Dokumentieren in einem Code-Kommentar in `firestoreClient.ts`.
- **Abhängigkeit von PR #500:** Dieser Plan baut auf `withFreshAuth` / `ensureFreshAuth` aus PR #500 auf. Reihenfolge: PR #500 mergen → diesen Branch starten.

---

## DoD (Definition of Done)

- [ ] Task 0 (Dedup-Bug) gemerged oder in diesem Branch integriert
- [ ] Alle Client-Writes gehen durch `@/lib/firestoreClient`
- [ ] ESLint-Regel `error`-Level aktiv, keine Violations
- [ ] Alle Tests grün (`npm run check`)
- [ ] Smoke-Test manuell nach Standby bestanden
- [ ] PR geöffnet, Reviewer informiert
