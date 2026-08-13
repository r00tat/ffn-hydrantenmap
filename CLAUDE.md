# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Einsatzkarte (operations map) for Freiwillige Feuerwehr Neusiedl am See - a PWA for authenticated users to view fire hydrant locations, manage Lageführung (situation management), Einsatztagebuch (operational diary), vehicle tracking, and hazmat database.

## Commands

```bash
npm run dev          # Development server (Turbopack)
npm run build        # Production build (Turbopack)
npm run start        # Start production server
npm run lint         # ESLint validation
npm run typecheck    # TypeScript type check (TypeScript 7)
npm run test         # Run Vitest tests once
npm run test:watch   # Run Vitest in watch mode
npm run check        # Run all checks: typecheck, lint, tests, build
npm run clean:cache  # Turbopack-Caches löschen (siehe unten)
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

### TypeScript 6 und 7 parallel

Der Typecheck läuft über **TypeScript 7** (Go-Compiler, ~1,3s statt ~8,8s), das Paket
liegt als Alias `typescript7` in den devDependencies. `npm run typecheck` ruft es über den
expliziten Pfad `node_modules/typescript7/bin/tsc` auf — nicht über `npx tsc`, weil beide
Pakete ein `tsc`-Binary mitbringen und nicht garantiert ist, welches in
`node_modules/.bin/` landet.

Das Paket `typescript` bleibt bewusst bei **6.x**, weil `typescript@7` unter `.` nur noch
`lib/version.cjs` exportiert und die Compiler-API nicht mehr mitliefert:

- `typescript-eslint` (via `eslint-config-next`) crasht damit sofort
  (`TypeError: Cannot read properties of undefined (reading 'Cjs')`). Peer-Range ist
  `>=4.8.4 <6.1.0`; TS-7-Support ist dort abgelehnt, bis die stabile API in TS 7.1 kommt.
- `next build` löst `typescript/package.json` auf und nutzt dessen `bin.tsc`, prüft also
  weiterhin mit TS 6.

Sobald typescript-eslint auf der TS-7.1-API aufsetzt: `typescript` auf `^7` ziehen und den
`typescript7`-Alias samt `typecheck`-Pfad entfernen.

### Turbopack-Cache

Turbopack cacht auf Platte, getrennt nach Modus: `next dev` in `.next/dev/cache/turbopack`,
`next build` in `.next/cache/turbopack`. Beides ist seit 16.3 standardmäßig an und bringt
die Startup- und Memory-Gewinne von 16.3 überhaupt erst.

**Der Cache wird nie kompaktiert.** Gemessen an diesem Projekt wachsen pro Build ~3,7 MB
und 5 `.sst`-Dateien dazu (424 → 435 MB über vier Builds), es gibt keine
Größenbegrenzung, kein GC und kein Max-Age. Dazu ist das Verzeichnis an die Next-Version
gebunden (`v16.3.0-<hash>`) — ein Update legt ein neues an und lässt das alte liegen. Über
Monate summiert sich das auf Gigabyte. Bei Bedarf:

```bash
npm run clean:cache   # rm -rf .next/cache/turbopack .next/dev/cache/turbopack
```

Deshalb löscht `npm run dev` **nicht** mehr das ganze `.next` (vorher `rm -rf .next` vor
und nach dem Start) — das warf genau diesen Cache jedes Mal weg. Unter Next 16 ist das
unbedenklich, weil der Dev-Output unter `.next/dev/` liegt und die Prod-Artefakte
(`.next/server`, `.next/static`, Manifeste) unberührt bleiben: `next start` funktioniert
nach einer Dev-Session weiterhin.

Im **Docker-Build** ist der Build-Cache abgeschaltet (`DISABLE_TURBOPACK_BUILD_CACHE=1` im
Dockerfile, ausgewertet über `turbopackFileSystemCacheForBuild` in `next.config.js`): Die
Builder-Stage startet aus einer frischen Layer und nach unten kopiert werden nur
`.next/standalone` und `.next/static` — der Cache wäre ~430 MB, die geschrieben und nie
gelesen werden.

## Android-Build (Capacitor)

Der native Android-Build läuft im Verzeichnis `capacitor/android/` über Gradle. Aktuell: **AGP 8.13.0**, **Gradle 8.14.3**.

**Wichtig: Build-JDK muss JDK 21 sein.** AGP 8.x unterstützt JDK 26 nicht — ein Build mit JDK 26 schlägt mit `JdkImageTransform`-Fehler beim Transformieren von `core-for-system-modules.jar` fehl.

```bash
cd capacitor/android
JAVA_HOME=$(/usr/libexec/java_home -v 21) ./gradlew :app:assembleDebug
```

Bei Aufrufen aus Tools (z.B. Capacitor Sync, Android Studio) muss `JAVA_HOME` ebenfalls auf JDK 21 zeigen. Wenn AGP/Gradle/Kotlin später aktualisiert werden, ist die JDK-Pinning-Anforderung in einem separaten Branch zu prüfen.

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
gh release create v<version> --title "v<version> <Kurzbeschreibung>" --notes "$(cat <<'EOF'
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

**Service Worker / PWA** (`@serwist/turbopack`): Der Service Worker wird aus
`src/worker/index.ts` gebaut und über den Route Handler
[src/app/serwist/\[path\]/route.ts](src/app/serwist/[path]/route.ts) als SSG-Route unter
`/serwist/sw.js` ausgeliefert — nicht mehr als Datei in `public/`. Er enthält sowohl das
Serwist-Precaching als auch die FCM-Background-Handler.

- Registriert wird er im Root-Scope, einmal über den `SerwistProvider` in
  [src/app/layout.tsx](src/app/layout.tsx) (in Dev deaktiviert) und einmal in
  [src/components/firebase/messaging.ts](src/components/firebase/messaging.ts), sobald
  Push-Rechte erteilt sind. Root-Scope trotz Unterpfad geht, weil der Route Handler
  `Service-Worker-Allowed: /` setzt.
- Die alte URL `/firebase-messaging-sw.js` gibt es nicht mehr. Firebase braucht diesen
  festen Pfad nur, wenn `getToken()` keine eigene Registrierung bekommt — `messaging.ts`
  übergibt eine. Bereits installierte PWAs behalten ihre alte Registrierung aber (ein 404
  auf das Skript meldet einen Worker nicht ab), deshalb räumt
  `unregisterLegacyServiceWorker()` aus [src/common/serviceWorker.ts](src/common/serviceWorker.ts)
  sie aktiv weg. Diese Funktion darf erst entfernt werden, wenn alle Clients migriert sind.
- Serwist bündelt den Worker mit `esbuild-wasm` (Default auf allen Nicht-Windows-Systemen).
  Zur Laufzeit wird esbuild nicht gebraucht, weil die Route vollständig prerendered ist —
  daher fehlt es korrekt im `.next/standalone/node_modules`.

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

In-App-Bug-Reports und Feature-Requests werden über den Bug-Report-Dialog
([src/components/bugReport/](src/components/bugReport/)) in die Firestore-Collection
`bugReport` geschrieben. Der TypeScript-Typ liegt in [src/common/bugReport.ts](src/common/bugReport.ts)
(`BugReport`: u.a. `kind` `'bug' | 'feature'`, `title`, `description`,
`status` `'open' | 'in_progress' | 'closed' | 'wontfix'`, `createdAt`, `createdBy`,
`context` mit `url`/`buildId`/`database`/`platform`/`firecallId`, `logs`, `screenshots`).

**Wichtig:** Produktive Bug-Reports liegen in der **Default-Datenbank `(default)`** des
Projekts `ffn-utils` — NICHT in `ffndev`. Das Feld `context.database` zeigt, aus welcher
Umgebung der Report stammt (`""` = prod, `ffndev` = dev).

**Reports abrufen (Firebase MCP, neueste zuerst):**

```jsonc
// Tool: firestore_query_collection
{
  "collection_path": "bugReport",
  "database": "(default)",            // prod; für Dev: "ffndev"
  "filters": [],                       // optional, z.B. status == "open"
  "order": { "orderBy": "createdAt", "orderByDirection": "DESCENDING" },
  "limit": 15
}
```

Nur offene Reports: `filters: [{ field: "status", op: "EQUAL", compare_value: { string_value: "open" } }]`.

Alternativ im Admin-Panel unter `/admin/bug-reports`
([src/app/admin/bug-reports/](src/app/admin/bug-reports/)), wo sich auch Status und
Empfänger-E-Mails (`appConfig/bugReport`) pflegen lassen.

## Fahrtenbuch-Wochenbericht

Cloud Scheduler ruft montags 07:00 (Europe/Vienna)
`POST /api/fahrtenbuch/weekly-report` auf. Der Lauf verschickt je Gruppe mit
gepflegten `fahrtenbuchConfig.mangelEmails` einen Bericht über die Fahrten der
abgeschlossenen ISO-Vorwoche — Fahrtentabelle je Fahrzeug, Wochensumme,
Plausibilitätswarnungen zu den Zählerständen und die offenen Mängel. Empfänger
sind dieselben wie bei der Mangel-Benachrichtigung; eine leere Liste ist die
Abschaltung.

Authentifiziert über ein OIDC-ID-Token, geprüft von
[cronRequired](src/server/auth/cronRequired.ts) gegen `CRON_INVOKER_EMAILS`.
Infrastruktur im Terraform-Modul
[cloud-scheduler](terraform/modules/cloud-scheduler/) — in Dev bewusst
**pausiert**, damit nicht zwei Umgebungen dieselbe Verteilerliste bemailen.

Die Plausibilitätswarnungen vergleichen auch gegen die letzte Fahrt **vor** dem
Zeitraum. Nur so fällt ein falscher Kilometerstand am Wochenanfang auf — der
Grund, aus dem es den Bericht überhaupt gibt.

Zum Prüfen ohne Versand (`dryRun` baut den Bericht und gibt Betreff und
Textfassung zurück, verschickt aber nichts):

```bash
SERVICE_URL=https://<host>
TOKEN=$(gcloud auth print-identity-token \
  --impersonate-service-account=fahrtenbuch-report-invoker@<projekt>.iam.gserviceaccount.com \
  --audiences="$SERVICE_URL")
curl -s -X POST "$SERVICE_URL/api/fahrtenbuch/weekly-report" \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"year":2026,"week":32,"dryRun":true}' | jq
```

Ein Fehler bei einer Gruppe beendet den Lauf nicht und ergibt trotzdem 200 —
sonst würde der Scheduler wiederholen und den erfolgreichen Gruppen die Mail
doppelt schicken. 500 gibt es nur, wenn **keine** Gruppe eine Mail bekommen hat
**und mindestens eine gescheitert ist**; dann ist die Wiederholung gefahrlos.
Ein Lauf, in dem alle Gruppen übersprungen wurden (keine Empfänger gepflegt) und
ein Lauf ohne jede konfigurierte Gruppe antworten dagegen mit 200: Da ist nichts
zu wiederholen. Eine stumme Woche ist deshalb an den `results` zu erkennen, nicht
am Status-Code.

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
  Origins, siehe unten
- `CRON_INVOKER_EMAILS` — komma-separierte Allowlist der
  Service-Account-Adressen, die zeitplan-gesteuerte Endpoints aufrufen dürfen
  (aktuell `/api/fahrtenbuch/weekly-report`). **Pflicht für diese Endpoints:**
  Ohne die Variable lehnt `cronRequired` jeden Aufruf ab (fail closed) — ein
  offener Endpoint, der Mails an gepflegte Verteilerlisten verschickt, wäre ein
  Mail-Relay. Der Wert ist die E-Mail des Invoker-Service-Accounts aus dem
  Terraform-Modul `cloud-scheduler`.
- `CRON_OIDC_AUDIENCE` (optional) — erwartete Audience des OIDC-Tokens. Ohne
  Angabe gilt `getBaseUrl()`. Nötig, wenn Cloud Scheduler auf die
  `run.app`-URL zeigt, die App aber unter der Custom Domain läuft.

### Basis-URL und erlaubte Origins

Cloud Run stellt die öffentliche URL **nicht** als Umgebungsvariable bereit —
Custom Domains sind dem Container unbekannt. Die Origin kommt deshalb aus dem
Request: Cloud Run reicht den Original-`Host` durch und setzt
`X-Forwarded-Proto`. Zuständig ist [src/server/auth/baseUrl.ts](src/server/auth/baseUrl.ts):

- `requestOrigin()` — Origin aus den Forwarded-Headern, geprüft gegen die
  Allowlist. Für WebAuthn zwingend, weil RP ID und Origin sich zwischen Prod,
  Dev und localhost unterscheiden.
- `getBaseUrl()` — dasselbe, mit `NEXTAUTH_URL` als Fallback für request-lose
  Kontexte (E-Mail-Versand, Hintergrund-Jobs). Für generierte Links verwenden.

Ohne `PASSKEY_ALLOWED_ORIGINS` gilt `NEXTAUTH_URL` plus `http://localhost:3000`.
**Außerhalb von Produktion** wird zusätzlich jede Loopback-Adresse akzeptiert
(`localhost`, `127.0.0.1`, `::1`) — unabhängig von Port und Schema, damit
`next dev -p 3001` und `npm run dev:https` (dort lautet die Origin
`https://localhost:3000`) nicht an einer auf einen Port festgelegten Allowlist
scheitern. LAN-IPs und Tunnel-Domains bleiben außen vor: über http sind sie kein
Secure Context, dort verweigert schon der Browser die WebAuthn-Ceremony. Wer sie
braucht (z.B. `*.nip.io` mit TLS für Gerätetests), trägt sie explizit in
`PASSKEY_ALLOWED_ORIGINS` ein.

Wird eine Origin abgelehnt, protokolliert `requestOrigin()` sie zusammen mit der
Allowlist — der Aufrufer sieht sonst nur `passkey: request origin is not allowed`.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
