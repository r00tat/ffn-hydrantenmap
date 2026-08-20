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
npm run test:coverage # Run Vitest with coverage report (coverage/)
npm run check        # Run all checks: typecheck, lint, tests, build
npm run clean:cache  # Turbopack-Caches löschen (siehe unten)
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

## Deployment (Cloud Run über Terraform)

Der Cloud-Run-Dienst liegt in [terraform/modules/cloud-run](terraform/modules/cloud-run/);
deployt wird mit `tofu apply`, nicht mit `gcloud run deploy`. Der Deploy-Job in
[cloud-run.yml](.github/workflows/cloud-run.yml) baut das Image und appliziert
anschließend den Root der Zielumgebung — dev bei jedem Push auf main, prod bei
jedem Release-Tag.

**Es gibt genau einen automatischen Applier.** [terraform.yml](.github/workflows/terraform.yml)
plant nur noch (PRs) und hat einen `workflow_dispatch`-Apply als Handgriff. Beide
Workflows teilen die Concurrency-Gruppe `tf-apply-<env>`, zwei gleichzeitige
apply auf denselben State sind damit ausgeschlossen.

**Der Plan läuft ohne State-Lock** (`-lock=false`). Ein Plan liest den State und
schreibt ihn nicht; mit Lock scheitert er sofort mit `412 conditionNotMet`,
sobald irgendwo ein apply läuft. Die Concurrency-Gruppen der Plan-Jobs sind
per-PR und wissen von `tf-apply-<env>` nichts — der Apply der Projekt-Basis
läuft bei jedem Push auf main und traf so wiederholt die Plans offener PRs
(#702). Der Preis ist ein Plan gegen einen State, der sich gerade ändert: Er
kann veraltet sein, und was er zeigt, ist ohnehin nie eine Zusage für den
späteren apply. Ein Plan gegen einen fremden apply anzuhalten würde den
PR-Check nur so lange blockieren, wie der apply dauert, und danach dasselbe
Ergebnis liefern.

**Aus PRs wird nicht mehr deployt.** Ein Deploy ist jetzt ein Apply, und ein
Apply mit ungeprüftem Terraform-Code aus einem PR-Branch gegen die gemeinsame
Dev-Umgebung wäre nicht zu verantworten.

### Einen Branch auf dev ausrollen

*Actions → Cloud Run → Run workflow*, Branch wählen, `serving_revision` **leer
lassen**. Das baut das Image, appliziert die Projekt-Basis und appliziert dev —
dieselben drei Jobs wie ein Push auf main, nur für diesen Branch. Zielumgebung
ist dev, weil sie aus `github.ref_type` abgeleitet wird; nach prod geht nur ein
Tag. Der Branchname wird zum Traffic-Tag, die Revision ist danach unter
`https://<tag>---<dienst>-<hash>.a.run.app` erreichbar.

Ist das Feld dagegen gefüllt, ist es ein Rollback: Der Build entfällt und der
Traffic geht auf die genannte, bereits existierende Revision.

**Ein PR pusht kein Image.** Er plant nur, also würde das Image in der Registry
liegen, ohne je eine Revision zu werden — und von keiner Aufräumregel erfasst,
weil die an den Revisionen hängt. Gebaut wird trotzdem: Der Build ist der Test,
dass das Image überhaupt entsteht, und trägt Lint und Tests. Steuernd ist
`PUSHED` im Setup-env-Step von [cloud-run.yml](.github/workflows/cloud-run.yml);
daran hängen auch der Inline-Cache und der Digest-Step, denn ohne Push gibt es
keinen Registry-Digest.

Deshalb löscht [cleanup-artifacts.yml](.github/workflows/cleanup-artifacts.yml)
beim Schließen eines PRs auch keinen Traffic-Tag mehr — der `traffic`-Block in
terraform ist autoritativ, und `--keep-branches` lässt den Tag eines gemergten
Branches beim nächsten Dev-Deploy von selbst wegfallen. Das Image wird weiter
gelöscht, weil ein von Hand ausgerollter Branch eines hat.

### Revisionsnamen und Fingerabdruck

Der Revisionsname wird gesetzt, nicht von Cloud Run generiert — sonst kennt
terraform ihn beim Plan nicht und könnte keinen Traffic-Tag darauf legen. Er
lautet `<dienst>-<version>-<fingerabdruck>`, wobei der Fingerabdruck ein Hash
über alles ist, was ins Template einfließt (`local.template_fingerprint`).

Revisionen sind unveränderlich: Ein geändertes Template unter einem schon
vergebenen Namen wird abgelehnt. Der Fingerabdruck sorgt dafür, dass sich der
Name genau dann ändert, wenn sich der Inhalt ändert — ein apply ohne Änderung
legt keine neue Revision an. **Wer dem Template ein Feld hinzufügt, trägt es in
den Fingerabdruck ein**, sonst scheitert der apply an einem Namenskonflikt.

**Ausgerollt wird der Digest, nicht der Tag.** Der Build gibt
`<image>@sha256:…` weiter (`image_ref` in [cloud-run.yml](.github/workflows/cloud-run.yml)),
nicht `<image>:main`. Ein Tag ist veränderlich: Jeder Push auf main baut nach
`…:main`, zwei Pushes hintereinander ergäben denselben Fingerabdruck, denselben
Revisionsnamen und damit „no changes" — das neue Image würde nie ausgerollt.
Mit `gcloud run deploy` fiel das nicht auf, weil gcloud jedes Mal einen frischen
Revisionsnamen erzeugt. Der Digest ändert sich genau dann, wenn sich der Inhalt
ändert; der Tag bleibt in der Registry als Einstieg für Menschen. Wer die
Image-Referenz je wieder aus einem Tag bildet, bricht den Dev-Deploy —
lautlos, weil der apply erfolgreich durchläuft.

### Traffic-Tags und ihre Bereinigung

Der `traffic`-Block ist autoritativ: Was nicht drinsteht, verliert seinen Tag.
Das ist beabsichtigt, denn ein Tag macht seine Revision adressierbar und nimmt
sie damit dauerhaft aus Cloud Runs automatischer Bereinigung (Limit 1000
Revisionen je Dienst, 2000 Tags je Projekt und Region). Vor der Umstellung waren
so 108 Tags in prod und 73 in dev aufgelaufen, die meisten davon Branches, die es
längst nicht mehr gibt.

Welche Tags bleiben, entscheidet [scripts/cloud-run-tfvars.sh](scripts/cloud-run-tfvars.sh),
das vor jedem Plan und Apply `cloudrun.auto.tfvars.json` schreibt (gitignored):

- **prod:** `--keep 20` — die zwanzig jüngsten Releases als Rollback-Fenster.
- **dev:** `--keep-branches` — nur Tags, zu denen es auf origin noch einen Branch
  gibt. Ein gemergter Branch verliert seinen Tag beim nächsten Dev-Deploy von
  selbst.

Das Skript ist auch die einzige Stelle, die einen Git-Ref auf einen Tag
normalisiert (`--print-tag`); der Workflow bildet den Image-Tag darüber, statt
die Abbildung ein zweites Mal in `sed` nachzubauen.

**Lokal genügt `npm run tfvars:dev` bzw. `npm run tfvars:prod`.** Das `--env`
des Skripts fragt den Terraform-Root per `tofu console` nach Projekt, Region
und `local.service_name` und leitet daraus auch Zieldatei und
Aufbewahrungsregel ab — deshalb steht in `package.json` keine Projekt-ID und
kein Dienstname. Voraussetzung ist ein initialisierter Root (`tofu init`).
Argumente lassen sich durchreichen: `npm run tfvars:dev -- --image … --version …`.

**Ohne `--image` liest das Skript Image und Revisions-Suffix aus dem laufenden
Dienst.** Nur deshalb kann ein Apply von Hand, der etwa Firestore-Regeln ändert,
die App nicht versehentlich auf einen alten Stand zurückdrehen. Das Suffix steht
dafür als Label `deploy-version` an der Revision.

### Rollback

Ein `gcloud run services update-traffic` von Hand ist **kein Rollback mehr,
sondern Drift** — der nächste apply dreht ihn zurück. Der Weg zurück führt über
den Workflow:

*Actions → Cloud Run → Run workflow*, Feld `serving_revision` auf die
Zielrevision (z.B. `hydrantenmap-v2-62-0-a1b2c3d4`). Ist das Feld gesetzt, wird
der Build übersprungen — ein Rollback baut nichts, es zeigt auf eine Revision,
die es schon gibt. Getaggte Revisionen sind vorher unter ihrer eigenen URL
(`https://<tag>---<dienst>-<hash>.a.run.app`) prüfbar.

Der Nachteil gegenüber `gcloud`: Ein Rollback dauert so lang wie ein Apply,
Größenordnung ein bis zwei Minuten statt zehn Sekunden.

### Übernahme bestehender Dienste

`imports.tf` in beiden Roots holt den seit 2021 bzw. 2022 bestehenden Dienst in
den State. Die Blöcke dürfen stehenbleiben — terraform überspringt sie, sobald
die Ressource im State liegt — und können nach dem ersten erfolgreichen Apply in
beiden Umgebungen entfallen.

## Projekt-Basis

**Ein Root je GCP-Projekt, nicht je Environment** — derzeit
[terraform/projects/ffn-utils](terraform/projects/ffn-utils/). Dort liegt alles,
was ein Environment-Apply bereits **vorfindet**, statt es anzulegen: die Rechte
des Pipeline-SA, die aktivierten APIs, die Secret-Hüllen, die Registries, der
WIF-Pool, die Storage-Regeln.

Vorher gehörte das dem Prod-Root über ein `manage_project_base`-Flag. Damit hing
eine Voraussetzung des Dev-Applies an der Release-Kadenz von prod: Eine neue
Rolle wurde erst beim nächsten Release wirksam, und bis dahin scheiterte dev mit
403 auf der neuen Ressource. Das galt genauso für ein neues Dev-Secret oder eine
neu gebrauchte API. Die Regel „erst prod applien" war das Symptom, nicht die
Lösung — sie ist ersatzlos entfallen.

**Der Base-Job in [cloud-run.yml](.github/workflows/cloud-run.yml) läuft vor
jedem Environment-Apply**, parallel zum Build. Die Reihenfolge ist damit
erzwungen statt dokumentiert. Der `workflow_dispatch`-Apply in
[terraform.yml](.github/workflows/terraform.yml) kennt `base` zusätzlich als
Auswahl — gebraucht wird er nur für den Erstimport.

### Wenn dev ein eigenes Projekt bekommt

Die Struktur ist darauf ausgelegt und ändert sich dabei **nicht**: Es kommt ein
zweiter Root `terraform/projects/<projekt-id>/` dazu, und `BASE_ROOT` in beiden
Workflows zeigt für dev dorthin. Die Environment-Roots bleiben, wie sie sind.

Ersatzlos entfallen dann die Kunstgriffe, die es nur gibt, weil beide sich ein
Projekt teilen: `name_suffix` im [cloud-scheduler](terraform/modules/cloud-scheduler/),
der zweite Eintrag in `local.cron_invoker_emails` samt `check`-Block, das `-dev`
im Dienstnamen, die `SUMUP_*_DEV`-Secrets und die Firestore-Datenbank `ffndev`.
`CLOUDSDK_CORE_PROJECT`, `WORKLOAD_IDENTITY_PROVIDER`, `TERRAFORM_SERVICE_ACCOUNT`,
`GOOGLE_SERVICE_ACCOUNT`, `IMAGE` und `RUN_SERVICE` wandern vom Repository- in
den Environment-Scope.

**Wichtig dabei: nichts über die Projektgrenze reichen lassen.** Sonst kehrt
genau dieselbe Falle als Cross-Project-Abhängigkeit zurück, nur schlimmer — ein
Service Account kann sich im fremden Projekt keine Rechte erteilen. Betrifft drei
Dinge, die heute geteilt sind und dann verdoppelt gehören: **State-Bucket**
(sonst müsste prod dem Dev-SA Zugriff geben), **Artifact Registry** (sonst
bräuchte der Dev-Runtime-SA einen Cross-Project-Reader) und der **WIF-Pool**.
Hält man das durch, wissen die beiden Pipelines nichts mehr voneinander.

Der Erstaufbau eines neuen Projekts (Projekt, Bucket, SA, WIF, erste Rollen)
bleibt Handarbeit — er erzeugt die Credentials, mit denen terraform danach
arbeitet.

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
- **`process.env` im Worker muss eingetragen werden.** Der Worker wird von esbuild
  gebaut, **nicht** von der Next.js-Pipeline — dort ersetzt niemand
  `process.env.NEXT_PUBLIC_*`, und im `ServiceWorkerGlobalScope` gibt es kein
  `process`. Eine stehengebliebene Referenz beendet die Auswertung des Skripts mit
  `ReferenceError: process is not defined`; die Registrierung scheitert dann
  **vollständig** — kein Precaching, keine Caching-Regeln, keine Push-Nachrichten,
  und eine installierte PWA bleibt unter ihrem alten Worker (Ursache von #663).
  Jede Variable, die ein Modul unter `src/worker/` liest, gehört deshalb in
  `SERVICE_WORKER_ENV_KEYS` in [serviceWorkerDefine.ts](src/server/serviceWorkerDefine.ts);
  der Route Handler reicht die Tabelle als `esbuildOptions.define` weiter. Ein Test
  dort liest die Worker-Quellen und schlägt fehl, wenn eine Variable fehlt.
  Von selbst setzt esbuild nur `process.env.NODE_ENV` ein, abgeleitet aus `minify`.
- Alles, was auf oberster Ebene des Workers laufen kann, gehört in ein `try`. Die
  Firebase-Messaging-Einrichtung steht deshalb in `startBackgroundMessaging()` mit
  `catch` drumherum: Push ist die Kür, Precaching die Pflicht — ein Wurf dort darf
  nicht den ganzen Worker mitnehmen.
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

### Bearbeitung: Felder, Verlauf, Kommentare

Neben dem Status sind `githubIssue`, `assignee` und `internalNote` am Report pflegbar.
Dazu kommt der Verlauf in der Subcollection **`bugReport/{id}/comments`**.

- **Ein Eintrag ist entweder ein Kommentar oder eine Feldänderung**
  (`entryType`, [bugReport.ts](src/common/bugReport.ts)). Beides landet in derselben
  Subcollection, weil beides dieselbe Frage beantwortet: was ist mit dem Report passiert.
  Ein Array im Dokument wäre die Alternative gewesen — dann schreibt jeder Kommentar das
  ganze Dokument neu, samt Logs und Screenshot-Pfaden.
- **Jede Feldänderung erzeugt ihren Verlaufseintrag in derselben Action**
  (`updateBugReportAction`). Wer ein weiteres Feld pflegbar macht, trägt es in
  `BUG_REPORT_TRACKED_FIELDS` ein — sonst ändert es sich lautlos.
- **Eine Änderung ohne Unterschied schreibt nichts.** `computeBugReportChanges` vergleicht
  gegen den gespeicherten Stand; ohne das erzeugte jedes Speichern im Dialog einen leeren
  Eintrag. Ein geleertes Feld fliegt per `FieldValue.delete()` aus dem Dokument.
- **`visibility` ist für den Melder vorgesehen, wird aber nur als `internal` geschrieben.**
  Eine Ansicht für den Melder gibt es (noch) nicht. Das Feld steht trotzdem von Anfang an
  am Eintrag: Ob ein bereits geschriebener Kommentar für fremde Augen gedacht war, lässt
  sich nachträglich nicht mehr feststellen.
- **`githubIssue` wird beim Speichern zur URL normalisiert**
  ([bugReportTracking.ts](src/common/bugReportTracking.ts)), eingegeben werden darf auch
  `#704`. Angezeigt wird wieder die Kurzform. Das Anlegen des Issues läuft über einen
  vorbefüllten `issues/new`-Link, nicht über die GitHub-API — dafür bräuchte der Dienst
  ein Token, und angelegt wird das Issue ohnehin von Hand.
- **Die Subcollection ist für Clients gesperrt** (`allow read, write: if false` in beiden
  `firestore.rules`). Ohne die explizite Regel wäre sie es auch — Regeln kaskadieren
  nicht —, aber interne Notizen sollen nicht daran hängen, dass niemand `{doc=**}`
  daraus macht.

### Screenshot-Aufnahme

Der Dialog wird für die Aufnahme nur **ausgeblendet** (`display: none`), nicht
geschlossen — sonst wären Eingaben und der eingefrorene Kontext weg. Solange er
weg ist, liegt der
[ScreenshotCaptureOverlay](src/components/bugReport/ScreenshotCaptureOverlay.tsx)
darüber: Ohne ihn hielten Nutzer den Dialog für geschlossen, navigierten weg und
verloren ihren Report (#662). Er blockiert die Bedienung für die Dauer der
Aufnahme und bietet immer einen Weg zurück.

Drei Dinge hängen daran zusammen:

- **Das Overlay trägt `data-skip-screenshot="true"`** und wird damit vom Filter
  in [captureScreenshot.ts](src/components/bugReport/captureScreenshot.ts) aus
  dem Bild geworfen. Alles, was während einer Aufnahme sichtbar sein soll, aber
  nicht ins Bild gehört, braucht dieses Attribut.
- **`disableEnforceFocus` am Dialog**, solange aufgenommen wird. Der Dialog ist
  weiter `open`, sein Focus-Trap zöge den Fokus sonst aus dem Overlay heraus und
  der Abbrechen-Button wäre per Tastatur nicht erreichbar.
- **`captureRunRef`** zählt jeden Lauf hoch. Eine Aufnahme, die nach dem
  Abbrechen doch noch fertig wird, darf weder das Overlay zurückholen noch einen
  Screenshot anhängen.

`captureScreenshot()` hat ein eigenes Timeout (`SCREENSHOT_TIMEOUT_MS`, 15s):
`modern-screenshot` bringt keines mit, und in mobilen WebViews lädt das
`foreignObject`-Bild unter Speicherdruck gelegentlich nie fertig — ohne Timeout
bliebe der Dialog dauerhaft ausgeblendet. Vor dem Snapshot wird über zwei
`requestAnimationFrame` auf einen Paint gewartet, sonst steht der eben erst
ausgeblendete Dialog noch im Bild.

## Fahrtenbuch-PDF-Export

Der Export ([fahrtenbuchExportActions.ts](src/components/Fahrtenbuch/fahrtenbuchExportActions.ts))
rendert **nicht ein Dokument**, sondern Teildokumente von je 100 Tabellenzeilen,
die [renderFahrtenbuchPdf](src/components/Fahrtenbuch/renderFahrtenbuchPdf.ts)
mit `pdf-lib` zu einer Datei zusammenfügt.

Grund ist der Speicher: `@react-pdf/renderer` hält das vollständig ausgelegte
Dokument bis zum Schluss im Speicher, gemessen 0,3–0,5 MB je Zeile. Ein
Jahresexport über alle Fahrzeuge kam auf ~600 MB und wurde vom Container (damals
512Mi) abgeräumt — im Browser als `503 Service unavailable` sichtbar (#665). Am
teuersten ist ein **einzelnes** Fahrzeug mit vielen Fahrten, weil react-pdf einen
über viele Seiten laufenden Abschnitt beim Umbrechen wiederholt neu auslegt:
3000 Fahrten auf einem Fahrzeug kosteten 2061 MB und 36 s, in Teilen 920 MB und
15 s.

Daran hängen drei Dinge, die zusammengehören:

- **Die Seitenzahl wird nach dem Zusammenfügen gestempelt.** Ein Teildokument
  kennt nur seine eigenen Seiten und finge sonst jedes Mal wieder bei 1 an.
  Die Maße des Fußes (`FOOTER_*` in
  [FahrtenbuchPdf.tsx](src/components/Fahrtenbuch/FahrtenbuchPdf.tsx)) sind
  deshalb exportiert und werden von beiden Seiten benutzt.
- **Teile nicht kleiner machen.** Jedes Teil beginnt eine neue Seite; unter 50
  Zeilen wächst die Datei, ohne Speicher zu sparen.
- **Ein Render je Instanz.** `renderFahrtenbuchPdf` serialisiert die Läufe —
  Cloud Run lässt bis zu 80 Anfragen auf denselben Container, und ein OOM reißt
  alle mit, nicht nur den Export.

Das Speicherlimit steht auf **1Gi**, als Vorgabewert von `memory` in
[terraform/modules/cloud-run](terraform/modules/cloud-run/variables.tf). Vorher
war es ein `--memory`-Flag am `gcloud run deploy`, und weil `gcloud` additiv
arbeitet, hing der tatsächliche Wert daran, ob seit der Änderung schon einmal
deployt wurde — prod lief nach #674 noch monatelang auf den alten 512Mi.

Die Größenprüfung (`MAX_EXPORT_ENTRIES`, 5000) läuft als Count-Query **vor** dem
Lesen. Die Zählung braucht dasselbe `orderBy('abfahrt', 'desc')` wie die
Leseabfrage — sonst sucht Firestore einen Index `deleted ASC, abfahrt ASC`, den
es nicht gibt.

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

Job und Invoker-Service-Account legt terraform an; nach dem `apply` ist nur noch
der Job in Prod zu entpausieren. Dev und Prod teilen das Projekt `ffn-utils`,
deshalb tragen die Ressourcen beider Umgebungen ein `name_suffix` (Prod `""`, Dev
`"-dev"`) — ohne das legten beide Roots denselben Service Account und denselben
Job an und der zweite `apply` scheiterte mit 409.

Die API-Aktivierung (`cloudscheduler.googleapis.com`) und die Rolle
`roles/cloudscheduler.admin` des Pipeline-SA hängen beide am Modul
[project-base](terraform/modules/project-base/). Das liegt im Projekt-Root
(siehe „Projekt-Basis"), der in beiden Pipelines vor jedem Environment-Apply
läuft — eine Erweiterung ist damit sofort wirksam. Die frühere Regel „erst prod
applien" gibt es nicht mehr.

Die Allowlist `CRON_INVOKER_EMAILS` setzt terraform als Env-Var des Dienstes
(`local.cron_invoker_emails` im jeweiligen Root). Sie wird dort aus Zeichenketten
gebaut statt aus `module.cloud_scheduler` gelesen: Der Dienst braucht die Liste,
der Scheduler braucht die URL des Dienstes — eine Referenz ergäbe einen Zyklus.
Ein `check`-Block im Root prüft deshalb nach jedem apply, dass der tatsächliche
Invoker-SA auf der gebauten Liste steht. Wer eine Umgebung hinzufügt, erweitert
die Suffix-Liste **und** setzt das passende `name_suffix`.

**Von Hand versenden:** Im Admin-Bereich unter Fahrtenbuch → Einstellungen sitzt
der Abschnitt „Wochenbericht versenden"
([WeeklyReportSendSection](src/components/Fahrtenbuch/admin/WeeklyReportSendSection.tsx)).
Woche wählbar (letzte abgeschlossene voreingestellt), Empfänger vorbelegt aus
`mangelEmails` und **nur für diesen Versand** überschreibbar — die Änderung wird
nicht gespeichert. „Vorschau" ist der `dryRun` und verschickt nichts.

Der Versand läuft über `sendWeeklyReportForGroup`, das dieselbe interne
`runForGroup` benutzt wie der Montagslauf: Die Mail von Hand ist dieselbe
Nachricht, nicht bloß eine gleich gebaute. Empfänger sind dort **Pflicht**, es
gibt keinen Rückfall auf die gepflegte Liste — wer das Feld leer räumt, würde
sonst ausgerechnet die Adressen bemailen, die er gerade entfernt hat.

Die Plausibilitätswarnungen vergleichen auch gegen die letzte Fahrt **vor** dem
Zeitraum. Nur so fällt ein falscher Kilometerstand am Wochenanfang auf — der
Grund, aus dem es den Bericht überhaupt gibt.

Zum Prüfen ohne Versand (`dryRun` baut den Bericht und gibt Betreff und
Textfassung zurück, verschickt aber nichts):

```bash
SERVICE_URL=https://<host>
# In Dev heißt der Invoker fahrtenbuch-report-invoker-dev (siehe name_suffix).
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

## Fahrzeug-Cache im Fahrtenbuch

Zählerstände, letzte Fahrt, Defekt-Hinweis und Mängelzähler stehen am
Fahrzeugdokument, damit die Übersicht sie zeigen kann, ohne alle Fahrten und
Mängel der Gruppe zu laden. Geschrieben wird der Cache an genau einer Stelle:
`refreshVehicleCache` in [mangelStore.ts](src/components/Fahrtenbuch/mangelStore.ts),
aufgerufen nach jeder Mutation an einer **Fahrt oder einem Mangel**.

- **Eine Funktion für beide Hälften**, weil sie sich überschneiden:
  `lastEntryMangelId` sagt, ob es zur jüngsten Fahrt einen Mangeldatensatz
  gibt, und ändert sich sowohl mit der Fahrt als auch mit den Mängeln. Zwei
  Auffrischungen, die je nur ihre Hälfte kennen, ließen genau die Widersprüche
  zu, aus denen #706 entstand.
- **Geschrieben wird mit `merge: true`**, deshalb setzt die Funktion *alle*
  Felder — ein weggelassenes ließe den alten Wert stehen. Wer ein Feld
  hinzufügt, trägt es dort ein.
- **„Defekt gemeldet" ist der Rückfall für Altdaten**, nicht die zweite Anzeige
  neben dem Mängelzähler. Die Regel steht in
  [defectHint.ts](src/components/Fahrtenbuch/defectHint.ts) und gilt für
  Fahrzeugkarte und Fahrzeugseite gleichermaßen: Gibt es zur letzten Fahrt
  einen Mangeldatensatz, spricht dieser — offen über den Zähler, behoben gar
  nicht mehr. Vorher verdeckte der Zähler den Hinweis nur, und das Beheben des
  letzten Mangels machte ihn nicht weg, sondern erst sichtbar.
- **`undefined` heißt „nie geschrieben", nicht „nein".** Fahrzeuge, deren Cache
  älter ist als ein Feld, fallen auf die Ableitung aus den geladenen Fahrten
  und Mängeln zurück; ein gecachtes `null`/`false`/`0` tut das nicht.
## Doppelte Fahrten zu einem Einsatz

Die Fahrten eines Einsatzes entstehen von zwei Seiten: über die Sammelerfassung
auf der Einsatzseite und über den Fahrtenbuch-Dialog. Trug jemand alle Fahrten
ein und der Fahrer später seine eigene noch einmal, stand dieselbe Fahrt zweimal
im Fahrtenbuch — mit doppelten Kilometern und dadurch falschen Zählerständen für
alle folgenden Fahrten.

**Duplikat heißt Einsatz + Fahrzeug.** Pro Einsatz fährt ein Fahrzeug einmal;
mehrere Fahrzeuge und mehrere Fahrer je Fahrzeug bleiben unberührt. Die
Erkennung sitzt in `findEntryForFirecallVehicle`
([common/fahrtenbuch.ts](src/common/fahrtenbuch.ts)) und wird von beiden Seiten
benutzt.

- **Die Schranke steht in der Action**, nicht im Dialog:
  `createFahrtenbuchEntry` und `updateFahrtenbuchEntry` lehnen mit
  `duplicateFirecallEntry` ab, solange `confirmDuplicate` fehlt. Zwei Geräte
  können dieselbe Fahrt gleichzeitig offen haben. Geprüft wird gegen
  `doc.firecallId` und nicht gegen die Eingabe — ob die Verknüpfung am Dokument
  landet, entscheidet `buildEntryDocument` über den Zweck, und nur was
  gespeichert wird, kann ein Duplikat sein.
- **Bestätigen bleibt möglich.** Es gibt Einsätze, bei denen ein Fahrzeug
  tatsächlich zweimal ausfährt. Bestätigt wird im Formular *diese eine* Fahrt
  (`confirmedDuplicateId` in [useEntryFormState.ts](src/components/Fahrtenbuch/useEntryFormState.ts)),
  nicht das Formular — wechselt die Auswahl, ist die Bestätigung hinfällig.
- **Die Zeitüberschneidung ist nur eine Warnung.** `overlappingVehicleEntries`
  findet zwei Fahrten desselben Fahrzeugs mit überlappendem Zeitraum, also auch
  das Duplikat einer Fahrt **ohne** Einsatzverknüpfung — etwa aus dem
  Gastformular hinter einem Freigabe-Link, das den Einsatzbezug gar nicht
  mitschickt. Kein Riegel: Zeiten sind im Einsatz oft geschätzt. Berührende
  Zeiträume zählen nicht, das sind zwei aufeinanderfolgende Fahrten.
- **Der Einsatz kommt im Formular vor Zweck und Ziel** und ist immer sichtbar,
  nicht erst bei schon gesetztem Zweck „Einsatz" — vorher stand er hinter dem
  Ziel und blieb deshalb meist leer. Die Auswahl setzt den Zweck auf `einsatz`:
  `submit` schickt `firecallId` nur bei diesem Zweck, ohne das verlöre eine
  Fahrt die Verknüpfung stillschweigend und keine Duplikatserkennung fände sie
  je wieder. Umgekehrt räumt `changeZweck` die Verknüpfung — was im Feld steht,
  muss dem entsprechen, was gespeichert wird. Der Freitext bleibt der Weg für
  einen Einsatz, der nicht in der Liste steht; dass die Prüfungen dann nicht
  greifen, sagt ein Hinweis.
- **`fahrtenbuchEntryCount` am Einsatz** trägt die Anzeige in der
  Einsatz-Übersicht ([Einsaetze.tsx](src/components/pages/Einsaetze.tsx)).
  Denormalisiert wie der Routen-Cache `fahrtenbuchRoute` und aus demselben
  Grund: Die Übersicht zeigt alle Einsätze der Gruppe auf einmal, eine Abfrage
  je Karte wären dutzende Listener. Gezählt wird bei jedem Schreibvorgang neu
  aus dem Bestand statt hoch- und heruntergezählt; ein Zähler, der driftet, wäre
  schlimmer als keiner. Nur die Anzahl, keine Fahrzeug- oder Fahrernamen — das
  Einsatz-Dokument liest jedes Gruppenmitglied, das Fahrtenbuch nur wer dort
  Mitglied ist. Ein Fehler beim Schreiben bleibt beim Zähler und nimmt die
  erfasste Fahrt nicht mit.
- **Angezeigt wird nur der positive Fall.** Ein Einsatz ohne das Feld heißt
  „nichts bekannt", nicht „keine Fahrten": Für Einsätze von vor der Zählung
  wäre „0 Fahrten" eine falsche Aussage in genau die Richtung, die Duplikate
  erzeugt. Nachgezogen wird der Zähler über `syncFirecallEntryCount`, sobald
  jemand die Einsatzseite öffnet — dort sind die Fahrten dieses Einsatzes
  ohnehin geladen. Die Anzahl aus dem Browser ist nur der Anlass, gezählt wird
  serverseitig.
- **Ankunft vor Abfahrt** lehnt `validateEntryInput` mit
  `ankunftBeforeAbfahrt` ab und gilt damit auch serverseitig; `timeOrderInvalid`
  markiert das Feld sofort, statt die Meldung erst beim Speichern zu bringen.

## Mangel-Bilder

Zu einem Fahrzeugmangel gehören Fotos (`Mangel.images`, [mangel.ts](src/common/mangel.ts)).
Gespeichert wird der Storage-**Pfad**, nicht die URL — eine Download-URL veraltet, der
Pfad nicht. Dateien liegen unter `groups/{groupId}/mangel/{mangelId}/{uuid}-{name}`.

- **Gelesen wird über Signed URLs vom Server**, nicht über die Storage-Regeln: Die
  Berechtigung hängt an der Gruppenmitgliedschaft, und die steht in Firestore. Ein
  `firestore.get` aus einer Storage-Regel trifft immer die Default-Datenbank und gäbe in
  der Dev-Datenbank `ffndev` die falsche Antwort. Deshalb verweigert
  [storage.rules](storage.rules) jedem Client das Lesen und die Action `mangelImageUrls`
  ([mangelActions.ts](src/components/Fahrtenbuch/mangelActions.ts)) prüft die
  Mitgliedschaft und signiert. Gleiches Muster wie bei den Bug-Report-Anhängen.
- **Jeder Pfad aus dem Browser wird geprüft** (`sanitizeMangelImages`) — beim Schreiben
  *und* beim Signieren. Ohne das zeigte ein Mangel auf Dateien einer fremden Gruppe.
- **Hochgeladen wird erst beim Speichern** des Dialogs; nach einem erfolgreichen Upload
  gelten die Bilder sofort als gespeichert, damit ein zweiter Anlauf nach einem Fehler
  nicht dieselben Dateien noch einmal hochlädt.
- **Größe und Typ sind eine Schranke der `storage.rules`** (15 MB, `image/.*`), aber der
  Browser prüft sie vorher mit: `prepareMangelImage`
  ([compressImage.ts](src/components/Fahrtenbuch/compressImage.ts)) verkleinert und wirft
  dann gegen `MANGEL_MAX_IMAGE_BYTES`/`isAllowedMangelImageType` aus
  [mangel.ts](src/common/mangel.ts). Ohne das lehnt der Storage mit
  `storage/unauthorized` ab und der Melder liest nur „Upload fehlgeschlagen". Die Prüfung
  steht **nach** dem Verkleinern — ein 20-MB-Handyfoto ist danach in Ordnung — und **vor**
  dem ersten Upload, sonst lägen bei fünf Fotos die ersten vier ohne Dokument im Storage.
  Die 15 MB stehen an zwei Orten; ein Test in `src/common/mangel.test.ts` liest
  `storage.rules` und vergleicht.
- **Ein Foto ohne MIME-Typ** ist kein Sonderfall, sondern kommt von manchen
  Android-Sharetargets. Der Typ wird dann aus der Endung abgeleitet
  (`imageTypeFromName`); vorher ging die Datei als `application/octet-stream` in den
  Upload und lief in die Contenttype-Bedingung der Regel.
- **Gelöscht wird serverseitig** — beim Entfernen eines einzelnen Bildes (`updateMangel`
  bekommt die vollständige Liste, was fehlt, fliegt aus dem Storage) und beim Löschen des
  Mangels.
- **`storage.rules` wird über terraform ausgerollt**
  (`google_firebaserules_ruleset`/`_release` in
  [firebase.tf](terraform/modules/project-base/firebase.tf)), nicht über `firebase deploy`
  — in `firebase.json` steht die Datei deshalb bewusst nicht. Die Regeln gelten für den
  Default-Bucket `<projekt>.appspot.com`, den es je Projekt einmal gibt; sie liegen deshalb
  im Projekt-Root und werden bei jedem Push auf main vor dem Deploy appliziert. **Dev und
  prod teilen sich diesen Bucket** — beide Dienste tragen `ffn-utils.appspot.com` in ihrer
  Firebase-Konfiguration.
- Die Liste zeigt nur die **Anzahl** der Bilder, der Dialog die Vorschaubilder: Jedes Bild
  braucht eine eigene Signatur, für eine ganze Tabelle wären das dutzende Aufrufe.

## Einsatz-Fotos im Google Drive

Neben den Anhängen (Firebase Storage, `firecall.attachments`) gibt es auf der
Einsatz-Detailseite einen zweiten Ablageort: ein Google Shared Drive der
Feuerwehr, Struktur `<Basisordner>/YYYY/YYYY-MM-DD_Einsatzname`.

- **Die Bytes gehen nie über Cloud Run.** Der Server legt nur den Ordner an und
  eröffnet eine resumable Upload-Session
  ([driveFileActions.ts](src/components/drive/driveFileActions.ts)); der Browser
  lädt direkt zu Google. Der `Origin`-Header beim Eröffnen ist das, woran die
  Session ihre CORS-Erlaubnis knüpft — ohne ihn scheitert jeder Upload im
  Browser. Der Dienst hat 1 GiB und hat sich beim Fahrtenbuch-Export schon
  einmal daran verschluckt; genau das soll hier nicht wieder passieren.
- **Der Basisordner steht je Gruppe in `driveConfig`**, für Clients gesperrt,
  gepflegt unter `/admin/drive`. Keine Konfiguration heißt: die Funktion ist für
  die Gruppe aus. Es gibt bewusst kein zusätzliches `enabled`-Flag.
- **Der Service Account muss von Hand als Mitglied ins Shared Drive.** Terraform
  verwaltet keine Drive-Freigaben. Geschrieben wird mit
  [driveAuth.ts](src/server/auth/driveAuth.ts) — bewusst **nicht** mit
  `createWorkspaceAuth`, das impersoniert `EINSATZMAPPE_IMPERSONATION_ACCOUNT`
  und bräuchte Domain-Wide Delegation.
- **Die `thumbnailLink` der Drive-API funktioniert im Browser unserer Nutzer
  nicht** — sie setzt Drive-Zugriff des angemeldeten Google-Nutzers voraus.
  Deshalb der Proxy unter
  `/api/einsatz/[firecallId]/drive/[fileId]/thumbnail`. Der prüft, dass die
  Datei im Ordner *dieses* Einsatzes liegt; ohne diese Prüfung wäre er ein
  Leseproxy auf das ganze Shared Drive.
- **`driveFolderId` am Einsatz ist die Wahrheit**, nicht der Ordnername. Wird
  der Einsatz umbenannt oder umdatiert, benennt der nächste Upload den Ordner um
  bzw. verschiebt ihn in den richtigen Jahresordner.

## Straßen-Routing für Leitungen und Linien

Eine Lösch- oder Zubringerleitung (`connection`) und eine Linie (`line`) folgen
auf Wunsch dem Straßenverlauf statt der Luftlinie: Feld
**„Routing über Straße"**, Standard bleibt die direkte Verbindung.

- **Das Profil wählt nur die Linie** (Feld `routingProfile`, `walk`/`drive`).
  Eine Schlauchleitung hat kein solches Feld und bleibt beim Fußgänger-Profil —
  ein Schlauch folgt der Straße, fährt aber nicht. Bei der Linie kann beides
  gemeint sein: eine Strecke zu Fuß oder eine Anfahrt, für die Einbahnen und
  Abbiegeverbote gelten.
- **`routingPreference` gehört nur zum Auto-Profil.** Die Routes API nimmt es
  allein für `DRIVE` und `TWO_WHEELER` und lehnt den Aufruf sonst ab — bei `WALK`
  muss es weg. Die Geometrie kommt als `GEO_JSON_LINESTRING`, damit kein
  Polyline-Decoder nötig ist; GeoJSON zählt `[lng, lat]`.
- **Ein Aufruf für die ganze Leitung**, nicht einer je Abschnitt: Die Punkte
  dazwischen gehen als `intermediates` mit, die Antwort liefert je Abschnitt
  eine eigene Polyline. Über 25 Punkte wird in Blöcke geteilt, die sich um einen
  Punkt überlappen.
- **Die gesetzten Punkte bleiben Teil der Linie** (`stitchRoutedPositions` in
  [routedPath.ts](src/components/FirecallItems/elements/connection/routedPath.ts)).
  Google setzt Start und Ziel eines Abschnitts auf die Straße; die Strecke von
  dort zum tatsächlichen Punkt ist die Zuführung (Hydrant → Straße) und zählt
  für die Schlauchlängen mit. Eine Leitung führt **durch** den Verteiler, nicht
  an ihm vorbei.
- **Die Geometrie steht am Element** (`routedPositions`), zusammen mit der
  Signatur aus Punkten **und Profil**, für die sie gilt (`routedFor`). Das Profil
  gehört mit hinein: Ein Wechsel von Fuß auf Auto ändert die Route, ohne einen
  Punkt zu verschieben. Nur so zeichnet die Karte ohne Routing-Aufruf — ein
  Aufruf je Änderung, keiner je Render. Geroutet wird deshalb an den
  Mutationsstellen
  (`ensureConnectionRouting`): beim Zeichnen
  ([Leitungen/context.tsx](src/components/Map/Leitungen/context.tsx)), beim
  Verschieben, Einfügen und Löschen eines Punktes
  ([positions.ts](src/components/FirecallItems/elements/connection/positions.ts))
  und beim Speichern aus dem Dialog
  ([useFirecallItemUpdate.ts](src/hooks/useFirecallItemUpdate.ts)).
- **`distance` ist die Länge der gezeichneten Linie**, gemessen mit derselben
  `calculateDistance` wie die Luftlinie. Die Meter der Routes API bleiben
  ungenutzt: Sie kennen die Zuführungen nicht, und eine angezeigte Länge, die
  nicht zur Linie gehört, wäre im Einsatz irreführend.
- **Fällt das Routing aus, bleibt das Element** und trägt die Luftlinie samt
  Hinweis im Popup (`routingFailed`). Die Signatur wird auch beim Fehlschlag
  gesetzt — sonst liefe bei jeder weiteren Änderung ein neuer Versuch.
- **Über `MAX_ROUTING_POINTS` (50) wird nicht geroutet.** Die Schranke ist die in
  der Action, gegen alles, was aus dem Browser kommt; die Prüfung im Browser ist
  nur die Abkürzung dorthin. Wer die Option an einer Linie mit hunderten Punkten
  einschaltet — etwa an einer GPS-Aufzeichnung — sieht sofort die Luftlinie mit
  Hinweis, statt auf eine Ablehnung zu warten, die schon feststeht. Von selbst
  routet eine Aufzeichnung nie: `streetRouting` setzt der Recorder nicht, und
  ohne die Option ist `routingTodo` bei jedem Messpunkt `'none'`.
- **Die Felder liegen an `MultiPointItem`/`FirecallMultiPoint`**, angeboten
  werden sie nur in `fields()` von Leitung und Linie. `data()` ist die Grundlage
  jedes Schreibvorgangs — ein Feld, das dort fehlt, löscht ein Speichern aus dem
  Dialog (`setDoc` ohne `merge`).
- Die Server-Action darf **kein Leaflet** importieren (`window is not defined`).
  Deshalb die Trennung: `routedPath.ts` ist reine Geometrie für beide Seiten,
  `streetRouting.ts` liest die Felder am Element, `ensureConnectionRouting.ts`
  schreibt nach Firestore.

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
  Mail-Relay. In Cloud Run setzt terraform den Wert als Env-Var des Dienstes
  (`local.cron_invoker_emails` im jeweiligen Root), abgeleitet aus dem Projekt
  und den Namen der Invoker-Service-Accounts. Die Liste enthält die Invoker
  **beider** Umgebungen, weil Dev und Prod das Projekt `ffn-utils` teilen; deren
  Namen unterscheidet `name_suffix` des Moduls `cloud-scheduler`. Ein
  `check`-Block im Root prüft, dass der tatsächliche Invoker auf der Liste steht.

  **Bewusst kein Secret-Manager-Secret:** Der Wert ist eine Kennung, kein
  Geheimnis — wer die Adresse kennt, kann kein Token dafür ausstellen, dazu
  braucht es IAM-Rechte auf den Service Account.
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
