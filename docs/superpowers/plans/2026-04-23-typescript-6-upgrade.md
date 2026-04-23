# TypeScript 6 Upgrade Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade the project from TypeScript 5.9.3 to TypeScript 6.0.3 and resolve any resulting type errors or configuration issues.

**Architecture:** 
1. Update `package.json` with the new TypeScript version and update related `@types` if necessary.
2. Run a full project check using `npm run check` (which includes `tsc --noEmit`, linting, and tests).
3. Systematically address any type errors introduced by the new TypeScript version's stricter or changed rules.

**Tech Stack:** 
- TypeScript 6.0.3
- Next.js 16
- Vitest

---

### Task 1: Version Upgrade & Dependency Installation

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Update TypeScript version in `package.json`**

Update `devDependencies.typescript` to `^6.0.3`.

- [ ] **Step 2: Install dependencies**

Run: `npm install`

- [ ] **Step 3: Run initial check to identify errors**

Run: `npm run check`
Expected: Likely failures in `npx tsc --noEmit` due to TypeScript 6 changes.

- [ ] **Step 4: Commit version change**

```bash
git add package.json package-lock.json
git commit -m "chore: upgrade typescript to 6.0.3"
```

### Task 2: Resolve TypeScript 6 Type Errors

**Files:**
- To be determined based on Task 1 results.

- [ ] **Step 1: Analyze errors from `npm run check`**
Identify common patterns in the new errors (e.g., stricter null checks, changed built-in types, etc.).

- [ ] **Step 2: Fix errors in `src/common/`**
Address utility and type definition errors first.

- [ ] **Step 3: Fix errors in `src/app/` and `src/components/`**
Address React and Next.js related type errors.

- [ ] **Step 4: Fix errors in `src/server/`**
Address Firebase Admin and import script errors.

- [ ] **Step 5: Verify fixes**

Run: `npx tsc --noEmit`
Expected: PASS

- [ ] **Step 6: Commit fixes**

```bash
git add .
git commit -m "fix: resolve typescript 6 compatibility issues"
```

### Task 3: Final Validation

**Files:**
- N/A

- [ ] **Step 1: Run full project check**

Run: `npm run check`
Expected: PASS (tsc, lint, tests, build)

- [ ] **Step 2: Commit final state (if needed)**
If any minor adjustments were made.

---

**Execution Options:**

1. **Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration
2. **Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints
