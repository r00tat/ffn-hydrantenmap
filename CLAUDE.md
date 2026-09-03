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
| [docs/internationalisierung.md](docs/internationalisierung.md) | Neue UI-Strings, Message-Kataloge `messages/{de,en}.json`, Namespaces und Schlüsselkonventionen, `useTranslations`/`getTranslations`, `renderWithIntl` in Tests, Markdown-Doku unter `content/docs/` |
| [docs/deployment.md](docs/deployment.md) | Cloud Run, Terraform, Traffic-Tags, Rollback, Projekt-Basis |
| [docs/releases.md](docs/releases.md) | Ein Release erstellen |
| [docs/service-worker-pwa.md](docs/service-worker-pwa.md) | Änderungen unter `src/worker/`, Push, Precaching |
| [docs/auth-und-origins.md](docs/auth-und-origins.md) | Basis-URL, WebAuthn-Origins, Cron-Aufrufer |
| [docs/berechtigungen.md](docs/berechtigungen.md) | Rollen: globaler Admin, Gruppen-Admin, Gerätemeister, Gruppenmitglied, Einsatz-Gast; wer was vergibt, warum kein Custom Claim, die Guards |
| [docs/bug-reports.md](docs/bug-reports.md) | Bug-Report-Dialog, Verlauf, Screenshot-Aufnahme |
| [docs/fahrtenbuch.md](docs/fahrtenbuch.md) | PDF-Export, Wochenbericht, Fahrzeug-Cache, Einsatzbezug und Freigabe-Link, Personennamen, Duplikatsprüfung, Änderungsrecht an einer Fahrt, Personen-Benutzer-Zuordnung, Zeiten beim Zweckwechsel, Mangel-Bilder, Gerätemeister-Rolle (Rollen allgemein: docs/berechtigungen.md), Fahrzeugkategorie und Anzeigereihenfolge |
| [docs/einsatz-drive-fotos.md](docs/einsatz-drive-fotos.md) | Einsatz-Fotos im Google Shared Drive |
| [docs/einsatz-backup.md](docs/einsatz-backup.md) | Einsatz sichern und zurückspielen: Umfang, was bewusst fehlt, Gruppenwahl beim Import, Dateinamen von Anhängen |
| [docs/live-standort.md](docs/live-standort.md) | Live-Standort der Einsatzkräfte: warum ein Dokument je Gerät und nicht je Benutzer, Kopplung der Dokument-ID an die Firestore-Regeln, warum der Heartbeat nicht an der Geolocation hängt, die zwei Zeitgrenzen, Gerätelabel am Marker |
| [docs/strassen-routing.md](docs/strassen-routing.md) | Routing über Straße für Leitungen und Linien |
| [docs/loeschwasserfoerderung.md](docs/loeschwasserfoerderung.md) | Löschwasserförderung an der Leitung: Reibungstabelle und ihre Quelle, wahlweise Rohrhydraulik (Swamee-Jain) samt Stoffannahmen und Kupplungsverlust, warum die Tabelle die Kupplungen schon enthält, Querschnitt als Regler und die kanonische Form von `dimension`, Höhendaten, Pumpenstandorte, Länge und Schlaucheinteilung auf der Karte |
| [docs/pendelverkehr.md](docs/pendelverkehr.md) | Pendelverkehr an der Leitung und der Vergleich mit der Förderung: Umlaufformel, Füllstellen-Schranke, Fahrt-Routing, Planungswerte der Aufbauzeit, Seite „Löschwasserversorgung" |
| [docs/dammbau-sandsaecke.md](docs/dammbau-sandsaecke.md) | Sandsackbedarf für den Dammbau an der Linie: Verlege- und Befüllleistungstabellen der Lehrunterlage LU TE3 und ihre Gegenprüfung, Bauweisen, Freibord, Logistik, Summe über mehrere Dammabschnitte |
| [docs/kartenlayer.md](docs/kartenlayer.md) | Kartenlayer in `tiles.ts`: Kachelgröße der WMS-Layer, GetCapabilities der Dienste, Layer-IDs Burgenland, WISA-Kachel-Cache (ohne Capabilities) |
| [docs/hoehenmodell.md](docs/hoehenmodell.md) | Eigenes Höhenmodell: BEV-Datenquelle, Höhendatum und Kalibrierung, Kachelschema, Import und Höhenlinien |
| [docs/gelaende-3d.md](docs/gelaende-3d.md) | 3D-Ansicht des Geländes: Mesh in Mercator, lokal-metrische Szene, Überhöhung, Textur aus den Kartenkacheln |
| [docs/wasserstandsmodell.md](docs/wasserstandsmodell.md) | Wasserstandsmodell: Flutfüllung, Bänder am Element, Signatur, Kopplung an den Sandsackrechner |
| [docs/mcp-server.md](docs/mcp-server.md) | MCP-Server und OAuth 2.1: eigener Authorization Server, DCR und CIMD, Scopes, Tool-Set mit zwei Aufrufern, Signaturschlüssel und Betrieb |
| [docs/lagekarte-austausch.md](docs/lagekarte-austausch.md) | Import und Export für lagekarte.info: beobachtetes Format, Kupplungsmarker, `ffnd`-Block, Symbolkatalog und seine Lücken |
| [docs/eigene-kartenebenen.md](docs/eigene-kartenebenen.md) | Eigene WMS-/WMTS-Kartenebenen je Einsatz: Abgrenzung „Kartenebene" gegen „Ebene", Berechtigungen und warum die Firestore-Regeln nichts prüfen, GetCapabilities über den Server, Darstellung im Layer-Control |
| [docs/atemschutzsammelplatz.md](docs/atemschutzsammelplatz.md) | Atemschutzsammelplatz: warum jede Bereitstellung eines Trupps eine eigene Zeile ist, die sechs Kennungen der Flaschensuche und warum die Barcode-Spalte des Sybos-Exports nicht allein trägt, Dublettenbehandlung im Import, Berechtigungen, Kamera in der Android-App, Mangel-Verallgemeinerung, warum das Füllprotokoll unter der Gruppe liegt, Füllstation als Gerätetyp, Vorbelegung von `verrechnen` und `zweck`, wer eine Füllung nachträglich ändern darf, Ausdruck/CSV-Export/CSV-Import des Füllprotokolls, Verrechnung der Füllungen: Tarifwahl, Berechtigung, Storno |
| [docs/atemschutzueberwachung.md](docs/atemschutzueberwachung.md) | Atemschutzüberwachung (Einsatzzeitkontrolle): warum eine eigene Seite und nicht ein Reiter des Sammelplatzes, warum dieselbe Trupp-Sammlung, Druckabfragen als Array, rechnerische Einsatzdauer und ihre Gegenprüfung an FH-06, Rückmarschdruck = doppelter Vormarschdruckabfall, Drittelmarken gegen gemessenen Verbrauch, Gerätesatz aus dem Bestand, Geräte am Trupp, Warnungen auf zwei Wegen (Cloud Scheduler und FCM plus die offene Seite), Nutzlast im Service Worker, erneuter Einsatz und Übergabe zurück an den Sammelplatz, was „Trupp übernehmen" tut, taktische Einheit am Trupp (`entsendetAn`), die Kategorien ASSP und „nicht zugeordnet", Reiter je Einheit und „meine Einheit" als Geräteangabe, angetretener Rückzug beendet die Warnungen, Druckverlauf als Kurve, Sekunden in den Zeitfeldern, Push-Erlaubnis am Gerät, Mindestmessfenster des gemessenen Verbrauchs, Vorlauf der Meldung gegen Farbschwelle der Karte, überholte Drittelmarken, Warnungen als Snackbar auf der Seite |
| [docs/gruppen-stammdaten.md](docs/gruppen-stammdaten.md) | Absender, Bankverbindung und Logo je Gruppe: warum sie gemeinsam liegen, warum ohne sie kein Beleg entsteht, warum das Logo kein SVG sein darf, Storage-Pfad und Signierung |
| [docs/rettungskarten.md](docs/rettungskarten.md) | Rettungskarten aus dem Euro-Rescue-Katalog: warum kein Deep Link in die App geht, die offene API von Euro NCAP, Cache, Zuordnung Zulassung → Variante |

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
npm run terrainCalibrate              # Versatzgitter EVRF2000 → müA, s. docs/hoehenmodell.md
npm run terrainImport                 # Terrainkacheln aus dem BEV-ALS-DGM bauen und hochladen
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
standardmäßig der Ablauf aus dem Skill `github-issue-workflow` — Issue übernehmen,
Worktree anlegen, implementieren, Checks, PR, Worktree entfernen — ohne Rückfrage, es sei
denn, es wird ausdrücklich etwas anderes verlangt.

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

PR-Titel im Conventional-Commit-Format, Beschreibung auf Deutsch, Label nach Commit-Typ,
Assignee `r00tat`, `Closes #<issue>` im Body. Vorlage und Details:
Skill `github-issue-workflow`.

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

**Chip (und jedes `div`) in Typography:** `Typography` rendert je Variante ein
Blockelement — `body1`/`body2` ein `<p>`. Ein `Chip` darin ist ein `<div>` in
einem `<p>`, also ungültiges HTML, und React warnt zur Laufzeit mit
„cannot be a descendant of". Deshalb `component="div"` setzen:

```tsx
// Richtig:
<Typography variant="body2" component="div">
  1,5 bar je 100 m
  <Chip size="small" label="abgeleitet" />
</Typography>

// Falsch (Hydration-Warnung):
<Typography variant="body2">
  1,5 bar je 100 m
  <Chip size="small" label="abgeleitet" />
</Typography>
```

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
- `actionGroupAdminRequired(groupId)` — administrative operations within *one* group (Fahrtenbuch administration, group settings); see [docs/berechtigungen.md](docs/berechtigungen.md)
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
- `livelocation` - Live-Standorte je Einsatz (`call/{einsatzId}/livelocation/{uid}_{deviceId}`), **ein Dokument je Gerät** (siehe [docs/live-standort.md](docs/live-standort.md))
- `history` - Event history entries
- `layer` - Element-Gruppierung je Einsatz (**nicht** Kartenebenen)
- `mapLayer` - Eigene WMS-/WMTS-Kartenebenen je Einsatz (siehe [docs/eigene-kartenebenen.md](docs/eigene-kartenebenen.md))
- `user` - User profiles with authorization
- `clusters6` - Geohashed hydrant clusters
- `bugReport` - In-App Bug-Reports & Feature-Requests (siehe unten)
- `appConfig` - App-weite Konfiguration (u.a. Dokument `bugReport` mit Empfänger-E-Mails)
- `atemschutzGeraet` - Atemschutz-Ausrüstung je Gruppe (`groups/{groupId}/atemschutzGeraet`, siehe [docs/atemschutzsammelplatz.md](docs/atemschutzsammelplatz.md))
- `atemschutzFuellung` - Füllprotokoll je Gruppe (`groups/{groupId}/atemschutzFuellung`), mit `firecallId` als Einsatzbezug und `zweck` als Anlass. Ändern/Löschen nur durch den Erfasser (Firestore-Regel) bzw. den Gruppen-Admin (Server Action), nie nach der Verrechnung
- `atemschutzRechnung`, `atemschutzEmpfaenger`, `atemschutzConfig` - Verrechnung der Flaschenfüllungen je Gruppe; **ohne** Absender und Bankverbindung, die liegen in `groupConfig` (siehe [docs/atemschutzsammelplatz.md](docs/atemschutzsammelplatz.md))
- `groupConfig` - Stammdaten einer Gruppe: Absender, Bankverbindung und Logo (`groups/{groupId}/groupConfig/stammdaten`). Von Kostenersatz **und** Atemschutz-Verrechnung gelesen (siehe [docs/gruppen-stammdaten.md](docs/gruppen-stammdaten.md))
- `kostenersatzConfig` - Mailvorlagen des Kostenersatzes je Gruppe (`groups/{groupId}/kostenersatzConfig/email`)
- `atemschutzTrupp` - Bereitstellungen der Atemschutztrupps je Einsatz (`call/{firecallId}/atemschutzTrupp`). Trägt **beides**: die Logistik des Sammelplatzes und die Felder der Atemschutzüberwachung (`abfragen`, `ueberwachungUids`, `ueberwachungSeit`/`ueberwachungBis` als Zeitraum der Zeitkontrolle, `warnungen`, Gerätesatz) — ein Trupp ist ein Trupp (siehe [docs/atemschutzueberwachung.md](docs/atemschutzueberwachung.md))
- `atemschutzAusgabe` - Ausgabe der Ausrüstung am Sammelplatz je Einsatz
- `oauthClients`, `oauthAuthCodes`, `oauthRefreshTokens`, `oauthConsents` - OAuth-Authorization-Server des MCP-Zugangs, rein serverseitig (siehe [docs/mcp-server.md](docs/mcp-server.md))

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
- **Atemschutzsammelplatz (ASSP)** - Breathing apparatus staging area
- **Füllprotokoll** - Cylinder filling log
- **Atemschutztrupp** - Breathing apparatus team (usually three)

## Environment Configuration

Required environment variables (see `.env.local`):

- Firebase config (`NEXT_PUBLIC_FIREBASE_*`)
- `NEXT_PUBLIC_FIRESTORE_DB` - `ffndev` for dev, empty/default for prod
- `NEXTAUTH_SECRET`, `NEXTAUTH_URL`
- `PASSKEY_ALLOWED_ORIGINS` (optional) — komma-separierte Allowlist erlaubter
  Origins; ohne sie gilt `NEXTAUTH_URL` plus localhost. Siehe
  [docs/auth-und-origins.md](docs/auth-und-origins.md).
- `CRON_INVOKER_EMAILS` — Allowlist der Service-Account-Adressen, die
  zeitplan-gesteuerte Endpoints aufrufen dürfen (auch die Aufrufe aus Cloud
  Tasks). **Pflicht:** ohne die Variable lehnt `cronRequired` jeden Aufruf ab
  (fail closed). Siehe [docs/auth-und-origins.md](docs/auth-und-origins.md).
- `ATEMSCHUTZ_TASKS_QUEUE`, `ATEMSCHUTZ_TASKS_INVOKER` (optional) — Queue-Pfad
  und OIDC-Konto für die Termine der Atemschutzwarnungen. Ohne sie wird nichts
  geplant und es bleibt beim Netz-Zeitplan; lokal der Normalfall. Siehe
  [docs/atemschutzueberwachung.md](docs/atemschutzueberwachung.md).
- `CRON_OIDC_AUDIENCE` (optional) — erwartete Audience des OIDC-Tokens. Ohne
  Angabe gilt `getBaseUrl()`. Nötig, wenn Cloud Scheduler auf die
  `run.app`-URL zeigt, die App aber unter der Custom Domain läuft.
- `MCP_OAUTH_SIGNING_KEY` — RSA-Privatschlüssel (PKCS#8 PEM) des
  OAuth-Authorization-Servers. In der Cloud aus dem Secret Manager, lokal als
  Umgebungsvariable. Siehe [docs/mcp-server.md](docs/mcp-server.md).
- `MCP_WRITE_ENABLED` — schaltet die schreibenden MCP-Tools frei. In dev an,
  in prod zunächst aus.
- `NEXT_PUBLIC_FIREBASE_AUTH_PROXY` (optional) — `true` lässt den
  Firebase-Auth-Handler unter der eigenen Domain laufen statt auf
  `firebaseapp.com`; nötig für den Google-Login in WebKit-Browsern. Je Gerät
  mit `?authProxy=1` umschaltbar. **Jede Origin braucht dafür einen
  Redirect-URI-Eintrag am OAuth-Client.** Siehe
  [docs/auth-und-origins.md](docs/auth-und-origins.md).

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
