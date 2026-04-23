# GEMINI Guidelines for the Hydranten-Map Project

This document provides guidelines for AI assistants (like Gemini) to effectively understand and contribute to this project.

## Project Overview

This is a web application for the Neusiedl am See fire department (`Freiwillige Feuerwehr Neusiedl am See`). Its primary purpose is to display the locations of fire hydrants on an interactive map to assist during emergency operations.

For authenticated users, the application offers advanced features, including:

- Real-time situation management (`Lageführung`).
- An operational diary (`Einsatztagebuch`).
- Management of other resources and tactical information.

The application is designed to be mobile-first and is a Progressive Web App (PWA) for offline accessibility.

## Tech Stack

- **Framework**: [Next.js](https://nextjs.org/) (v16+) with the App Router.
- **Language**: [TypeScript](https://www.typescriptlang.org/).
- **UI Library**: [React](https://react.dev/) (v19+).
- **UI Components**: [Material-UI (MUI)](https://mui.com/).
- **Mapping**: [Leaflet](https://leafletjs.com/) via [React Leaflet](https://react-leaflet.js.org/).
- **Authentication**: [NextAuth.js](https://next-auth.js.org/) and [Firebase Authentication](https://firebase.google.com/docs/auth).
- **Backend & Database**: [Firebase](https://firebase.google.com/) (Firestore for data, Storage for files).
- **PWA**: [Serwist](https://serwist.pages.dev/) for service worker management.
- **Styling**: [Emotion](https://emotion.sh/).

## Architecture

### Directory Structure

- `src/app/` - Next.js App Router pages and API routes.
- `src/components/` - React components organized by feature (Map/, firebase/, providers/, pages/, FirecallItems/, Kostenersatz/).
- `src/hooks/` - Custom React hooks for state management and side effects.
- `src/common/` - Shared utilities and type definitions.
- `src/server/` - Server-side utilities (Firebase admin, data import/export).
- `src/worker/` - Service worker with FCM integration.
- `firebase/` - Firestore rules and indexes (separate dev/prod environments).

### Server Actions vs API Routes

Prefer Next.js Server Actions (`'use server'`) over API route handlers for data mutations.
**All server actions must be protected** with auth guards from `src/app/auth.ts`:

- `actionAdminRequired()` — admin-only operations.
- `actionUserRequired()` — any authorized user.
- `actionUserAuthorizedForFirecall(firecallId)` — user authorized for a specific firecall.

### Key Patterns

- **Firebase Integration**: Client-side in `src/components/firebase/firebase.ts`, Server-side Admin SDK in `src/server/firebase/admin.ts`.
- **Authentication Flow**: Firebase Auth (client) → ID token → NextAuth Credentials provider (server verification) → Session with authorization flags.
- **Map Architecture**: `PositionedMap` → `Map` (Leaflet config) → `Clusters` (marker clustering) + layer components.

### Firestore Collections

- `call` - Emergency operations (Einsätze).
- `item` - Items within firecalls (hydrants, vehicles, personnel).
- `history` - Event history entries.
- `layer` - Map layers per firecall.
- `user` - User profiles with authorization.
- `clusters6` - Geohashed hydrant clusters.

## Development Workflow

### Commands

```bash
npm run dev          # Development server
npm run lint         # ESLint validation
npm run test         # Run Vitest tests once
npm run check        # Run all checks: tsc, lint, tests, build
```

**TypeScript Policy**: `tsc --noEmit` errors must **NEVER** be ignored. Fix all type errors before committing.

### Testing (TDD)

- **Write tests first** for all new features.
- Place test files (`*.test.ts` / `*.test.tsx`) **directly next to** the source file.
- Do **not** use `__tests__/` folders.

### Git Workflow

- **Conventional Commits**: Use `feat:`, `fix:`, `chore:`, `docs:`, `refactor:`, `test:`, `perf:`, `ci:`.
- **Pull Requests**: Description must be in **German**. Run `npm run check` successfully before creating a PR.
- **Releases**: Semantic Versioning (`v<major>.<minor>.<patch>`). Descriptions in German.
- Before committing, reset `next-env.d.ts` to avoid noise from dev/build path switching
- When using `gh` CLI, unset `GITHUB_TOKEN` first to avoid authentication issues: `GITHUB_TOKEN= gh <command>`

## MUI Guidelines

**Tooltip + disabled Button**: Wrap `disabled` buttons in a `<span>` to ensure the Tooltip receives events:

```tsx
<Tooltip title="Help">
  <span>
    <IconButton disabled={isLoading}>
      <HelpIcon />
    </IconButton>
  </span>
</Tooltip>
```

## German Terminology

- **Einsatz/Firecall** - Emergency operation
- **Einsatztagebuch** - Operational diary
- **Fahrzeuge** - Vehicles
- **Schadstoff** - Hazardous materials
- **Lageführung** - Situation management
- **Hydranten** - Fire hydrants
- **Kostenersatz** - Cost recovery/billing

## Relevant Tools for Gemini

- **`read_file`**: Read file contents.
- **`write_file`**: Create new files.
- **`replace`**: Modify existing files.
- **`run_shell_command`**: Execute `npm` scripts, tests, or data imports.
- **`grep_search`**: Find code snippets or configurations.
- **`codebase_investigator`**: Analyze codebase, dependencies, and architecture.
