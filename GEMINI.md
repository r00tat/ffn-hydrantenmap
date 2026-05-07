# GEMINI Guidelines for the Hydranten-Map Project

This document provides foundational mandates and expert workflows for contributing to the Hydranten-Map project. These instructions take absolute precedence over general defaults.

## Project Overview

Interactive map and operations management system for the Neusiedl am See fire department (`Freiwillige Feuerwehr Neusiedl am See`).

- **Public**: Fire hydrant locations.
- **Authenticated**: Situation management (`Lageführung`), operational diary (`Einsatztagebuch`), vehicle tracking, hazardous materials database, and billing (`Kostenersatz`).
- **Platform**: PWA (Progressive Web App) with native Android build via Capacitor.

## Tech Stack

- **Framework**: [Next.js 16](https://nextjs.org/) (App Router).
- **Language**: [TypeScript 6](https://www.typescriptlang.org/).
- **UI**: [React 19](https://react.dev/) + [Material-UI (MUI) 9](https://mui.com/).
- **Mapping**: [Leaflet](https://leafletjs.com/) + [React Leaflet 5](https://react-leaflet.js.org/).
- **Database/Auth**: [Firebase 12](https://firebase.google.com/) (Firestore, Auth, Storage, Messaging).
- **Session**: [NextAuth.js 5 (Beta)](https://next-auth.js.org/).
- **PWA**: [Serwist](https://serwist.pages.dev/).
- **Testing**: [Vitest](https://vitest.dev/).
- **AI**: Google Vertex AI integration.

## Development Workflow

### Core Commands

```bash
npm run dev          # Development server (Webpack/Turbopack)
npm run lint         # ESLint 9 validation
npm run test         # Run Vitest tests once
npm run check        # Full validation: tsc, lint, tests, build
```

### Technical Integrity (Crucial)

1. **TypeScript Policy**: `tsc --noEmit` errors must **NEVER** be ignored. Fix all errors before committing.
2. **Individual Checks**: After features/fixes, run checks individually for better debugging:
   - `npx tsc --noEmit`
   - `npx eslint`
   - `npx vitest run`
   - `npx next build --webpack`

### Testing (TDD)

- **Mandatory TDD**: Write failing tests _before_ implementation code.
- **Location**: Place `*.test.ts/tsx` files **directly next to** the source file.
- **Tools**: Vitest + `@testing-library/react`.

## Git & PR Workflow

### Git Worktrees

- Use the hidden `.worktrees/` directory for isolation.
- **Wichtig**: Copy `.env.local` into new worktrees manually (`cp .env.local .worktrees/<branch>/`).

### Commit Standards

- **Conventional Commits**: `feat:`, `fix:`, `chore:`, `docs:`, `refactor:`, `test:`, `perf:`, `ci:`.
- **Pre-commit**: Reset `next-env.d.ts` (`git checkout -- next-env.d.ts`) to prevent noisy diffs.
- **CLI**: When using `gh`, always unset `GITHUB_TOKEN` (`GITHUB_TOKEN= gh <command>`).

### Pull Requests

- **Validation**: `npm run check` must pass before creation.
- **Language**: PR titles in English (Conventional Commits), but **Descriptions must be in German**.
- **Labels**:
  - `feat:` -> `feature`
  - `fix:` -> `bug`
  - `docs:` -> `documentation`
  - `chore(deps):` -> `dependencies`

### Releases

- **Versioning**: Semantic Versioning (`v<major>.<minor>.<patch>`).
- **Automation**: Use `gh release create` with summaries in **German**.

## Android Build (Capacitor)

The native build resides in `capacitor/android/`.

- **Versions**: AGP 8.13.0, Gradle 8.14.3.
- **Critical Restriction**: **MUST use JDK 21**. Higher versions (like JDK 26) cause `JdkImageTransform` failures.

```bash
cd capacitor/android
JAVA_HOME=$(/usr/libexec/java_home -v 21) ./gradlew :app:assembleDebug
```

## Architecture & Patterns

### Directory Structure

- `src/app/` - App Router pages & server-side logic.
- `src/components/` - Organized by feature (Map/, Kostenersatz/, FirecallItems/).
- `src/hooks/` - Feature-specific custom hooks (30+ for Firebase, map logic).
- `src/server/` - Admin SDK and data processing.

### Data Security

**Server Actions over API Routes**. All mutations must use guards from `src/app/auth.ts`:

- `actionAdminRequired()`
- `actionUserRequired()`
- `actionUserAuthorizedForFirecall(firecallId)`

### Firebase & Environments

- **Projects**: `ffndev` (development) vs. production. Controlled via `NEXT_PUBLIC_FIRESTORE_DB`.
- **Auth Flow**: Firebase Auth (client) -> ID Token -> NextAuth Credentials -> Session Flags (`isAdmin`, `isAuthorized`).

### Map Architecture

`PositionedMap` -> `Map` -> `Clusters` + specialized layers in `src/components/Map/layers/`.

### Terminology

- **Einsatz/Firecall**: Emergency operation.
- **Einsatztagebuch**: Operational diary.
- **Lageführung**: Situation management.
- **Kostenersatz**: Billing/Cost recovery.
- **Geschäftsbuch**: Business logbook.

## Data Management Scripts

- `npm run extract <har>`: Parse HAR files.
- `npm run import <type> <csv>`: Firestore import.
- `npm run clusterHydrants`: Generate geohashes.
- `npm run updateClusters`: Sync cluster data.

## MUI & UI Guidelines

- **Tooltip + disabled Button**: Wrap disabled buttons in a `<span>` to ensure Tooltip receives events.
- **Styling**: Use Emotion (via MUI `sx` or `styled`).
