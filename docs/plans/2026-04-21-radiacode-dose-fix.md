# RadiaCode Dose-Fix Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Die angezeigte Gesamtdosis ist 1000× zu groß. Den Konversionsfaktor
in der RadiaCode-Client-Decodierung korrigieren, Tests anpassen, Protokoll-Doku
berichtigen.

**Architecture:** Einzige Code-Änderung: Konstante in
`src/hooks/radiacode/client.ts` von `1e6` auf `1e3` ändern. Ein
bestehender Unit-Test für `extractLatestMeasurement`/`RadiacodeClient` wird
auf den neuen Faktor angepasst. Protokoll-Doku
`docs/radiacode-bluetooth-protocol.md` bekommt einen Einheit-Hinweis.

**Tech Stack:** TypeScript, Vitest.

**Kontext für Agent:**

- Root: `/Users/paul/Documents/Feuerwehr/hydranten-map`
- Arbeite in Worktree `.worktrees/radiacode-dose-fix`, basiert auf
  `feat/radiacode-via-bluetooth`.
- Vor Start: `cp .env.local .worktrees/radiacode-dose-fix/`.
- Vor Commit: `git checkout -- next-env.d.ts` (siehe
  [CLAUDE.md](../../CLAUDE.md)).
- Vor Merge: `npm run check` muss grün sein. TS-Fehler dürfen **nie**
  ignoriert werden.
- Commit-Messages: Conventional Commits (`fix(radiacode): …`).
- Am Ende: zurück in den Haupt-Checkout merge in `feat/radiacode-via-bluetooth`
  und Worktree aufräumen.

---

### Task 1: Failing Test für korrekten Faktor schreiben

**Files:**

- Modify: `src/hooks/radiacode/client.test.ts`

**Step 1: Bestehenden Faktor-Test finden**

Suche im File nach `DOSE_SV_TO_USV`, `1e6`, `1000000`, `dose:` in
Assertions. Notiere die Stelle, an der ein Roh-`dose`-Float eingeschleust
wird und der erwartete µSv-Wert assertet wird.

**Step 2: Test auf Faktor 1e3 umstellen**

Ändere den erwarteten Wert so, dass ein Rohwert von z.B. `0.05` (mSv) zu
`50` µSv wird statt zu `50000`.

**Step 3: Test ausführen**

Run: `NO_COLOR=1 npx vitest run src/hooks/radiacode/client.test.ts`
Expected: **FAIL**, weil die Production-Konstante noch `1e6` ist.

**Step 4: Commit (Test only)**

```bash
git add src/hooks/radiacode/client.test.ts
git commit -m "test(radiacode): erwarte korrekten dose-faktor (mSv->uSv)"
```

---

### Task 2: Konstante korrigieren

**Files:**

- Modify: `src/hooks/radiacode/client.ts:22-23`

**Step 1: Konstante umbenennen und Faktor ändern**

`const DOSE_SV_TO_USV = 1e6;` → `const DOSE_RAW_TO_USV = 1e3;`
Referenz an Zeile 359 entsprechend anpassen.

**Step 2: Test ausführen**

Run: `NO_COLOR=1 npx vitest run src/hooks/radiacode/client.test.ts`
Expected: **PASS**.

**Step 3: Vollchecks**

Run: `npm run check`
Expected: PASS (tsc, lint, tests, build).

**Step 4: Commit**

```bash
git add src/hooks/radiacode/client.ts
git commit -m "fix(radiacode): gesamtdosis-faktor von Sv zu mSv korrigiert"
```

---

### Task 3: Protokoll-Doku korrigieren

**Files:**

- Modify: `docs/radiacode-bluetooth-protocol.md` (Zeile 293 und 302)

**Step 1: Einheit in RareData-Zeile und Measurement-Liste aktualisieren**

Ersetze den Verweis „dose (µSv, aus RareData)" bzw. den Hinweis auf die
Einheit durch den korrekten Vermerk: Rohwert kommt als mSv, wird zur
App-Anzeige ×1e3 skaliert.

**Step 2: Commit**

```bash
git add docs/radiacode-bluetooth-protocol.md
git commit -m "docs(radiacode): dose-einheit in protokoll-referenz korrigiert"
```

---

### Task 4: Hardware-Verifikation dokumentieren

**Files:**

- Modify: `docs/plans/2026-04-21-radiacode-improvements-design.md` — Abschnitt
  „Offene Punkte für Implementierung"

**Step 1: Verifikation am Gerät**

Verbinde die Build-Version mit einem echten RadiaCode und vergleiche die
angezeigte Gesamtdosis mit der Geräte-Anzeige. Dokumentiere das Ergebnis
(erwartete/beobachtete Werte, Faktor-Bestätigung) im Design-Doc oder als
Commit-Message-Fußzeile.

**Step 2: Falls Faktor falsch:**

Wenn die Werte nach `1e3`-Korrektur immer noch nicht stimmen, ermittle den
tatsächlichen Faktor empirisch (Anzeige / Rohwert) und passe Task 2 an.
Nicht committen, bevor die Anzeige übereinstimmt.

**Step 3: Dokumentation des Prüfergebnisses**

Kurzer Eintrag in die PR-Description beim Merge: „Dose-Faktor gegen Gerät
<Serien-Nr.> verifiziert, Abweichung < 5%".

---

### Task 5: Merge zurück in Feature-Branch

**Step 1: Worktree-State prüfen**

```bash
cd .worktrees/radiacode-dose-fix
git status
git log --oneline feat/radiacode-via-bluetooth..HEAD
```

**Step 2: Finale Checks**

```bash
npm run check
```

**Step 3: Merge**

```bash
cd <repo-root>
git checkout feat/radiacode-via-bluetooth
git merge --no-ff .worktrees/radiacode-dose-fix
```

**Step 4: Worktree aufräumen**

```bash
git worktree remove .worktrees/radiacode-dose-fix
```
