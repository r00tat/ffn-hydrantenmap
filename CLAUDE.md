# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Einsatzkarte (operations map) for Freiwillige Feuerwehr Neusiedl am See - a PWA for authenticated users to view fire hydrant locations, manage Lageführung (situation management), Einsatztagebuch (operational diary), vehicle tracking, and hazmat database.

## Commands

```bash
npm run dev          # Development server (Turbopack)
npm run build        # Production build (Webpack)
npm run start        # Start production server
npm run lint         # ESLint validation
npm run test         # Run Vitest tests once
npm run test:watch   # Run Vitest in watch mode
npm run check        # Run all checks: tsc, lint, tests, build
NO_COLOR=1 npm run test  # Run tests without ANSI colors (easier to parse output)
```

**After completing a feature or bugfix, run `npm run check` to catch errors before committing.**

Data import scripts (require `GOOGLE_APPLICATION_CREDENTIALS` env var):

```bash
npm run extract <har-file> <prefix>   # Parse HAR files from Burgenland GIS
npm run import <type> <csv-file>      # Import CSV to Firestore
npm run clusterHydrants               # Generate geohashed clusters
npm run updateClusters                # Update cluster data in Firestore
```

## Git Worktrees

Use `.worktrees/` directory for git worktrees (project-local, hidden).

When setting up a worktree, copy `.env.local` into it (it's gitignored and won't be present automatically):

```bash
cp .env.local .worktrees/<branch-name>/
```

## Git Workflow

Before committing, reset `next-env.d.ts` to avoid noise from dev/build path switching:

```bash
git checkout -- next-env.d.ts
```

When using `gh` CLI, unset `GITHUB_TOKEN` first to avoid authentication issues:

```bash
GITHUB_TOKEN= gh <command>
```

### Conventional Commits

Alle Commit-Messages müssen dem [Conventional Commits](https://www.conventionalcommits.org/) Format folgen:

```text
<type>[optional scope]: <description>
```

Typen:

- `feat:` — Neues Feature (→ Minor Release)
- `fix:` — Bugfix (→ Patch Release)
- `chore:` — Wartung, Dependencies, CI (kein Release)
- `docs:` — Dokumentation
- `refactor:` — Refactoring ohne Funktionsänderung
- `test:` — Tests hinzufügen/ändern
- `perf:` — Performance-Verbesserung
- `ci:` — CI/CD Änderungen

Breaking Changes werden mit `!` nach dem Typ oder mit `BREAKING CHANGE:` im Body markiert (→ Major Release):

```text
feat!: neues Auth-System ersetzt bisheriges Login
```

### Pull Requests

**Vor dem Erstellen eines PRs** muss `npm run check` erfolgreich durchlaufen (keine Errors, keine Warnings).

**Sprache:** PR-Titel folgt dem Conventional Commit Format (englisch erlaubt), die **Beschreibung ist auf Deutsch**.

**Labels:** Auf jedem PR muss automatisch das passende Label gesetzt werden, basierend auf dem Commit-Typ:

- `feat:` → `feature`
- `fix:` → `bug`
- `docs:` → `documentation`
- `chore(deps):` / Dependabot → `dependencies`
- Sonstige Verbesserungen → `enhancement`

**PR-Beschreibung** (Deutsch, Markdown):

```markdown
## Zusammenfassung

<Kurze Beschreibung aller Änderungen im Branch gegenüber main>

## Änderungen

- <Auflistung der wesentlichen Änderungen>

## Test plan

- [ ] <Testschritte>

🤖 Generated with [Claude Code](https://claude.com/claude-code)
```

Beispiel (siehe PR #462): Zusammenfassung beschreibt das Feature, Änderungen listen alle wesentlichen Punkte, Testplan enthält konkrete Schritte.

### Releases

Releases folgen **Semantic Versioning** mit Tag-Format `v<major>.<minor>.<patch>` (z.B. `v2.36.1`).

**Versionierung** basierend auf den Commits seit dem letzten Release:

- Nur `fix:` Commits → **Patch** (z.B. `v2.36.0` → `v2.36.1`)
- Mindestens ein `feat:` oder `enhancement` → **Minor** (z.B. `v2.36.1` → `v2.37.0`)
- Mindestens ein Breaking Change (`!` oder `BREAKING CHANGE:`) → **Major** (z.B. `v2.37.0` → `v3.0.0`)

**Release-Beschreibung** (Deutsch, Markdown):

1. History seit dem letzten Release-Tag prüfen: `git log <last-tag>..HEAD --oneline`
2. Zusammenfassung auf Deutsch verfassen
3. Kategorien aus `.github/release.yml` verwenden (🏕 Features, 🛠️ Enhancements, 🪲 Bugfixes, 👒 Dependencies)
4. Titel: `v<version> <Kurzbeschreibung auf Deutsch>`

```bash
GITHUB_TOKEN= gh release create v<version> --title "v<version> <Kurzbeschreibung>" --notes "$(cat <<'EOF'
## Zusammenfassung
<Beschreibung auf Deutsch>

## What's Changed
### 🏕 Features
* feat: ... by @r00tat in #<PR>

### 🪲 Bugfixes
* fix: ... by @r00tat in #<PR>

**Full Changelog**: https://github.com/r00tat/ffn-hydrantenmap/compare/<last-tag>...<new-tag>
EOF
)"
```

## Testing (TDD)

**For all new features, write tests first before writing implementation code.** Follow test-driven development:

1. Write failing tests that define the expected behavior
2. Run `npm run test` to confirm the tests fail
3. Implement the feature code to make the tests pass
4. Run `npm run test` again to confirm all tests pass

Tests use **Vitest** with `@testing-library/react` and `@testing-library/jest-dom`. Place test files **directly next to** the source file they test using the `*.test.ts` / `*.test.tsx` naming convention (e.g., `utils.ts` → `utils.test.ts` in the same directory). Do **not** use `__tests__/` folders.

## Tech Stack

- **Next.js 16** with App Router (not Pages Router)
- **React 19** + **TypeScript**
- **Material-UI (MUI)** for components
- **Leaflet** + **React Leaflet** for maps
- **Firebase**: Firestore (database), Storage (files), Auth, Cloud Messaging
- **NextAuth.js** for session management
- **Serwist** for PWA/service worker

## Architecture

### Directory Structure

- `src/app/` - Next.js App Router pages and API routes
- `src/components/` - React components organized by feature (Map/, firebase/, providers/, pages/, FirecallItems/, Kostenersatz/)
- `src/hooks/` - Custom React hooks (34 hooks for Firebase, map editing, positioning, etc.)
- `src/common/` - Shared utilities and type definitions
- `src/server/` - Server-side utilities (Firebase admin, data import/export)
- `src/worker/` - Service worker with FCM integration
- `firebase/` - Firestore rules and indexes (separate dev/prod environments)

### Server Actions vs API Routes

Prefer Next.js Server Actions (`'use server'`) over API route handlers (`src/app/api/`) for data mutations and server-side operations. Server Actions provide better type safety, simpler client integration, and reduce boilerplate compared to manually creating API endpoints.

**All server actions must be protected** with the appropriate auth guard from `src/app/auth.ts`:

- `actionAdminRequired()` — admin-only operations (user management, system config)
- `actionUserRequired()` — any authorized/logged-in user
- `actionUserAuthorizedForFirecall(firecallId)` — user authorized for a specific firecall

Call the guard at the top of every server action before any logic. For API routes (legacy), use `adminRequired(req)` from `src/server/auth/adminRequired.ts` instead.

### Key Patterns

**Context Providers** (in `src/components/providers/`): FirecallProvider, FirecallLayerProvider, MapEditorProvider wrap the app for global state.

**Firebase Integration**:

- Client-side Firebase in `src/components/firebase/firebase.ts`
- Server-side Admin SDK in `src/server/firebase/admin.ts`
- Separate dev (`ffndev`) and prod Firebase projects configured via `NEXT_PUBLIC_FIRESTORE_DB`

**Authentication Flow**: Firebase Auth (client) → Firebase ID token → NextAuth Credentials provider (server verification) → Session with authorization flags (`isAuthorized`, `isAdmin`, `groups`).

**Map Architecture**: `PositionedMap` → `Map` (Leaflet config) → `Clusters` (marker clustering) + layer components in `components/Map/layers/`.

### Firestore Collections

- `call` - Emergency calls/operations (Einsätze)
- `item` - Items within firecalls (hydrants, vehicles, personnel)
- `history` - Event history entries
- `layer` - Map layers per firecall
- `user` - User profiles with authorization
- `clusters6` - Geohashed hydrant clusters

## German Terminology

Key domain terms used throughout the codebase:

- **Einsatz/Firecall** - Emergency operation
- **Einsatztagebuch** - Operational diary
- **Geschäftsbuch** - Business logbook
- **Fahrzeuge** - Vehicles
- **Schadstoff** - Hazardous materials
- **Lageführung** - Situation management
- **Hydranten** - Fire hydrants
- **Kostenersatz** - Cost recovery (billing for fire department services per tariff ordinance)

## Environment Configuration

Required environment variables (see `.env.local`):

- Firebase config (`NEXT_PUBLIC_FIREBASE_*`)
- `NEXT_PUBLIC_FIRESTORE_DB` - `ffndev` for dev, empty/default for prod
- `NEXTAUTH_SECRET`, `NEXTAUTH_URL`
- `MAPBOX_API_KEY` for enhanced map tiles
