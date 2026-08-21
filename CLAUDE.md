# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Einsatzkarte (operations map) for Freiwillige Feuerwehr Neusiedl am See - a PWA for authenticated users to view fire hydrant locations, manage Lageführung (situation management), Einsatztagebuch (operational diary), vehicle tracking, and hazmat database.

## Vertiefende Dokumentation

Diese Datei enthält die Regeln, die immer gelten. Der Hintergrund zu einzelnen
Themen steht in `docs/` und ist **erst zu lesen, wenn an der Stelle gearbeitet
wird** — dort steht jeweils das „warum", das sich aus dem Code nicht ableiten lässt:

| Dokument | Wann lesen |
| --- | --- |
| [docs/build-und-toolchain.md](docs/build-und-toolchain.md) | TypeScript 6/7 parallel, Turbopack-Cache, Android-Build (JDK 21) |
| [docs/deployment.md](docs/deployment.md) | Cloud Run, Terraform, Traffic-Tags, Rollback, Projekt-Basis |
| [docs/releases.md](docs/releases.md) | Ein Release erstellen |
| [docs/service-worker-pwa.md](docs/service-worker-pwa.md) | Änderungen unter `src/worker/`, Push, Precaching |
| [docs/auth-und-origins.md](docs/auth-und-origins.md) | Basis-URL, WebAuthn-Origins, Cron-Aufrufer |
| [docs/bug-reports.md](docs/bug-reports.md) | Bug-Report-Dialog, Verlauf, Screenshot-Aufnahme |
| [docs/fahrtenbuch.md](docs/fahrtenbuch.md) | PDF-Export, Wochenbericht, Fahrzeug-Cache, Einsatzbezug und Freigabe-Link, Personennamen, Duplikatsprüfung, Mangel-Bilder |
| [docs/einsatz-drive-fotos.md](docs/einsatz-drive-fotos.md) | Einsatz-Fotos im Google Shared Drive |
| [docs/strassen-routing.md](docs/strassen-routing.md) | Routing über Straße für Leitungen und Linien |
| [docs/loeschwasserfoerderung.md](docs/loeschwasserfoerderung.md) | Löschwasserförderung an der Leitung: Reibungstabelle und ihre Quelle, Höhendaten, Pumpenstandorte |

## Commands

```bash
npm run dev          # Development server (Turbopack)
npm run build        # Production build (Turbopack)
npm run start        # Start production server
npm run lint         # ESLint validation
npm run typecheck    # TypeScript type check (TypeScript 7)
npm run test         # Run Vitest tests once
npm run test:watch   # Run Vitest in watch mode
npm run test:coverage # Run Vitest with coverage report (coverage/)
npm run check        # Run all checks: typecheck, lint, tests, build
npm run clean:cache  # Turbopack-Caches löschen, s. docs/build-und-toolchain.md
npm run tfvars:dev   # Deploy-Variablen für terraform aus dem laufenden Dienst holen
npm run tfvars:prod  # dito für prod (siehe „Deployment")
NO_COLOR=1 npm run test  # Run tests without ANSI colors (easier to parse output)
```

**After completing a feature or bugfix, run the checks individually (not `npm run check`) so the source of any error is easier to spot:**

```bash
npm run typecheck      # TypeScript type check
npx eslint             # Lint
npx vitest run         # Tests
npx next build         # Production build
```

Run them in order and fix errors before moving on to the next step. Only run `npm run check` when you want a single combined pass.

**WICHTIG: TypeScript-Fehler dürfen NIEMALS ignoriert werden.** Auch wenn ein Fehler scheinbar vorbestehend ist, muss er untersucht und behoben werden, bevor committed wird. Kein Commit mit TSC-Fehlern.

Der Typecheck läuft über **TypeScript 7**, das Paket `typescript` bleibt bewusst bei 6.x;
der Turbopack-Cache wird nie kompaktiert und wächst mit jedem Build; der Android-Build
braucht **JDK 21**. Begründung und Details:
[docs/build-und-toolchain.md](docs/build-und-toolchain.md).

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

`next-env.d.ts` is gitignored — Next.js regenerates it on every `dev`/`build` and there's no need to stage or reset it.

**Wichtig:** `gh push` existiert nicht. Zum Pushen immer `git push` verwenden.

### Arbeiten an GitHub-Issues

Wird die Arbeit an einem Issue beauftragt (z.B. „arbeite an #123", „fix #123"), gilt
standardmäßig dieser Ablauf — ohne Rückfrage, es sei denn, es wird ausdrücklich etwas
anderes verlangt:

1. **Issue lesen und übernehmen:** `gh issue view <nr> --comments` — Kommentare gehören zur
   Anforderung. Danach `gh issue edit <nr> --add-assignee r00tat`, damit im Issue-Tracker
   sichtbar ist, dass daran gearbeitet wird.
2. **Worktree anlegen** statt im Hauptverzeichnis zu arbeiten. Branch nach
   Conventional-Commit-Typ und Issue-Nummer, Worktree-Verzeichnis mit `-` statt `/`:

   ```bash
   git worktree add -b fix/123-kurzbeschreibung .worktrees/fix-123-kurzbeschreibung main
   cp .env.local .worktrees/fix-123-kurzbeschreibung/
   cd .worktrees/fix-123-kurzbeschreibung && npm install --ignore-scripts
   ```

   `node_modules/` ist nicht Teil des Worktrees und fehlt sonst.
3. **Implementieren und committen** im Worktree (Conventional Commits, siehe oben).
4. **Vor dem Push** die Checks einzeln laufen lassen (`npm run typecheck`, `npx eslint`,
   `npx vitest run`, `npx next build`).
5. **PR erstellen** nach der Vorlage unten, inklusive `Closes #123`, passendem Label und
   `--assignee r00tat`.
6. **Worktree entfernen**, sobald der PR steht:

   ```bash
   cd /Users/paul/Documents/Feuerwehr/hydranten-map
   git worktree remove .worktrees/fix-123-kurzbeschreibung
   ```

Zu Schritt 6:

- **Erst aus dem Worktree herausgehen.** `git worktree remove` scheitert, solange das
  aktuelle Arbeitsverzeichnis darin liegt.
- **Nur entfernen, wenn alles gepusht ist.** Vorher `git status` und
  `git log origin/<branch>..HEAD` prüfen — nicht gepushte Commits sind nach dem Entfernen
  nur noch über das Reflog erreichbar. Niemals `--force` verwenden, um über einen
  schmutzigen Worktree hinwegzugehen; in dem Fall nachfragen.
- **Der lokale Branch bleibt bestehen** und ist damit nicht verloren. Kommen später
  CI-Fehler oder Review-Kommentare, wird der Worktree für denselben Branch einfach neu
  angelegt: `git worktree add .worktrees/fix-123-kurzbeschreibung fix/123-kurzbeschreibung`
  (ohne `-b`).
- Nach dem Merge räumt `/clean_gone` die verwaisten Branches und Worktrees auf.

### Plan- und Spec-Dokumente (Superpowers)

Alle Markdown-Dateien unter `docs/superpowers/` sind **gitignored**
(`.gitignore`: `/docs/superpowers/**/*.md`) und werden **nicht committet**. Das betrifft insbesondere:

- `docs/superpowers/plans/` — Implementierungspläne (Superpowers `writing-plans` / `executing-plans`)
- `docs/superpowers/specs/` — Design-/Spec-Dokumente (Superpowers `brainstorming`)

Neue Pläne und Specs gehören daher immer in `docs/superpowers/plans/` bzw. `docs/superpowers/specs/` —
sie bleiben rein lokale Arbeitsdokumente. Sie dürfen nicht gestaged oder mit `git add -f` erzwungen werden
und sind auch kein Teil von PR-Änderungslisten.

Das ältere Verzeichnis `docs/plans/` ist weiterhin versioniert (historische Pläne/Designs).
Dort keine neuen Dokumente ablegen.

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

**Assignee:** Auf jedem PR wird `r00tat` als Assignee gesetzt (`gh pr create --assignee
r00tat`) — GitHub trägt den Autor nicht von selbst ein. Bei einem PR zu einem Issue wird
auch das Issue selbst zugewiesen (`gh issue edit <nr> --add-assignee r00tat`).

**Issue-Verknüpfung:** Wird mit dem PR ein GitHub-Issue bearbeitet, muss die
PR-Beschreibung `Closes #<issue>` enthalten — dann schließt GitHub das Issue beim Merge
automatisch. Zu beachten:

- Das Schlüsselwort gehört in die **PR-Beschreibung** (Body), nicht in den Titel; im Titel
  wird es von GitHub ignoriert.
- Bei mehreren Issues wird das Schlüsselwort je Issue wiederholt:
  `Closes #123, closes #124` — ein `Closes #123, #124` schließt nur das erste.
- Betrifft der PR ein Issue, das **nicht** geschlossen werden soll (Teilarbeit), stattdessen
  ohne Schlüsselwort referenzieren: `Teil von #123`.

**PR-Beschreibung** (Deutsch, Markdown):

```markdown
## Zusammenfassung

<Kurze Beschreibung aller Änderungen im Branch gegenüber main>

## Änderungen

- <Auflistung der wesentlichen Änderungen>

## Test plan

- [ ] <Testschritte>

Closes #<issue>

🤖 Generated with [Claude Code](https://claude.com/claude-code)
```

Beispiel (siehe PR #462): Zusammenfassung beschreibt das Feature, Änderungen listen alle wesentlichen Punkte, Testplan enthält konkrete Schritte.

### Releases

Semantic Versioning, Tag-Format `v<major>.<minor>.<patch>`, Beschreibung auf Deutsch nach
den Kategorien aus `.github/release.yml`. Ablauf und Vorlage:
[docs/releases.md](docs/releases.md).

## Deployment

Ausgerollt wird mit `tofu apply` über [terraform/](terraform/), **nicht** mit
`gcloud run deploy`; ein `gcloud run services update-traffic` von Hand ist kein Rollback,
sondern Drift. Ein Push auf main deployt dev, ein Release-Tag deployt prod — aus PRs wird
nicht deployt. Rollout eines Branches, Rollback, Traffic-Tags, Revisions-Fingerabdruck und
Projekt-Basis: [docs/deployment.md](docs/deployment.md).

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

## MUI Guidelines

**Tooltip + disabled Button:** MUI Tooltip benötigt Events vom Child-Element. Ein `disabled` Button/IconButton/Fab feuert keine Events. Daher muss ein `<span>` Wrapper um das disabled Element gelegt werden:

```tsx
// Richtig:
<Tooltip title="Hilfe">
  <span>
    <IconButton disabled={isLoading}>
      <HelpIcon />
    </IconButton>
  </span>
</Tooltip>

// Falsch (verursacht MUI-Warnung):
<Tooltip title="Hilfe">
  <IconButton disabled={isLoading}>
    <HelpIcon />
  </IconButton>
</Tooltip>
```

Dies gilt für alle Button-Varianten (`Button`, `IconButton`, `Fab`) innerhalb von `Tooltip`.

## Internationalization (i18n)

Übersetzungen laufen über [`next-intl`](https://next-intl.dev). Unterstützt sind aktuell `de` (default/fallback) und `en`. Die Sprache wird pro Benutzer im Firestore-Profil gespeichert; die aktive Locale wird serverseitig in `src/i18n/getLocale.ts` ermittelt und über den Provider in `src/components/providers/` an Client-Komponenten weitergereicht.

**Message-Kataloge** liegen in `messages/<locale>.json` (z.B. `messages/de.json`, `messages/en.json`). Beide Dateien müssen denselben Schlüsselbaum haben — fehlende Schlüssel in `en.json` werden zur Laufzeit auf den deutschen Wert zurückfallen, fehlende Schlüssel in `de.json` führen zu Fehlern.

**Konventionen:**

- Namespaces folgen dem Feature/Komponenten-Kontext (`drawer`, `einsaetze`, `kostenersatz`, `docsNav`, …).
- Keine deutschen Wörter als Schlüssel — Schlüssel sind immer englisch und camelCase (`addEntry`, `noResults`, `deleteConfirm`).
- ICU-Platzhalter wie `{name}`, `{count}` werden via `t('key', { name, count })` befüllt. Pluralisierung über die `{count, plural, …}`-Syntax.
- Datums-/Zahl-/Listformatierung über `useFormatter()` statt manueller Strings.

**Verwendung in Komponenten:**

```tsx
// Client Component
'use client';
import { useTranslations } from 'next-intl';

export function MyButton() {
  const t = useTranslations('common');
  return <Button>{t('save')}</Button>;
}

// Server Component / Server Action
import { getTranslations } from 'next-intl/server';

export default async function Page() {
  const t = await getTranslations('einsaetze');
  return <h1>{t('title')}</h1>;
}
```

**Statisch typisierte Schlüssel:** Beim Iterieren über Schlüssel (z.B. Sidebar-Listen) muss das Array `as const` getypt werden, sonst beschwert sich TypeScript über die `NamespacedMessageKeys`-Constraint von `next-intl`.

**Markdown-Doku:** Statische Texte unter `/docs/<slug>` liegen in `content/docs/{de,en}/<slug>.md` und werden von `loadDocsContent(slug, locale)` geladen. Fehlt eine englische Übersetzung, wird automatisch die deutsche Version verwendet.

**Neue UI-Strings:**

1. Beide Locale-Dateien gleichzeitig erweitern (Schlüssel in beiden, Wert übersetzt).
2. Komponente auf `useTranslations`/`getTranslations` umstellen — keine hartkodierten deutschen Strings im JSX.
3. Komponenten-Tests müssen mit `renderWithIntl` aus `src/test-utils/intlRender.tsx` gerendert werden — das wrappt den Tree in einen `NextIntlClientProvider` mit der `messages/de.json` als Katalog.

Meldet `npm run typecheck` einen eben ergänzten Schlüssel als `not assignable to
parameter of type NamespacedMessageKeys`, ist es der inkrementelle Cache von TS 7:
`rm -f tsconfig.tsbuildinfo && npm run typecheck`. Siehe
[docs/build-und-toolchain.md](docs/build-und-toolchain.md).

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

**Service Worker / PWA** (`@serwist/turbopack`): gebaut aus `src/worker/index.ts`, ausgeliefert
über einen Route Handler unter `/serwist/sw.js`. Wer dort eine `process.env.*`-Variable liest,
trägt sie in `SERVICE_WORKER_ENV_KEYS` ([serviceWorkerDefine.ts](src/server/serviceWorkerDefine.ts))
ein — sonst scheitert die Registrierung vollständig. Details:
[docs/service-worker-pwa.md](docs/service-worker-pwa.md).

### Firestore Collections

- `call` - Emergency calls/operations (Einsätze)
- `item` - Items within firecalls (hydrants, vehicles, personnel)
- `history` - Event history entries
- `layer` - Map layers per firecall
- `user` - User profiles with authorization
- `clusters6` - Geohashed hydrant clusters
- `bugReport` - In-App Bug-Reports & Feature-Requests (siehe unten)
- `appConfig` - App-weite Konfiguration (u.a. Dokument `bugReport` mit Empfänger-E-Mails)

## Bug Reports / Feedback

In-App-Bug-Reports und Feature-Requests landen in der Firestore-Collection `bugReport`
([src/components/bugReport/](src/components/bugReport/)), verwaltet unter `/admin/bug-reports`.
**Produktive Reports liegen in der Default-Datenbank `(default)` von `ffn-utils`**, nicht in
`ffndev`. Abfrage über den Firebase MCP, Bearbeitung, Verlauf und Screenshot-Aufnahme:
[docs/bug-reports.md](docs/bug-reports.md).

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
- `PASSKEY_ALLOWED_ORIGINS` (optional) — komma-separierte Allowlist erlaubter
  Origins; ohne sie gilt `NEXTAUTH_URL` plus localhost. Siehe
  [docs/auth-und-origins.md](docs/auth-und-origins.md).
- `CRON_INVOKER_EMAILS` — Allowlist der Service-Account-Adressen, die
  zeitplan-gesteuerte Endpoints aufrufen dürfen. **Pflicht:** ohne die Variable
  lehnt `cronRequired` jeden Aufruf ab (fail closed). Siehe
  [docs/auth-und-origins.md](docs/auth-und-origins.md).
- `CRON_OIDC_AUDIENCE` (optional) — erwartete Audience des OIDC-Tokens. Ohne
  Angabe gilt `getBaseUrl()`. Nötig, wenn Cloud Scheduler auf die
  `run.app`-URL zeigt, die App aber unter der Custom Domain läuft.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
