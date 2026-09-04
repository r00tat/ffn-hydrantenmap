---
name: github-issue-workflow
description: Ablauf für die Arbeit an einem GitHub-Issue und für Pull Requests in diesem Repo. Verwenden, sobald die Arbeit an einem Issue beauftragt wird („arbeite an #123", „fix #123", „implementiere Issue 123") oder ein Pull Request erstellt, beschrieben, gelabelt oder mit einem Issue verknüpft werden soll. Enthält Issue-Übernahme, Worktree-Anlage, Branch-Namen, Checks vor dem Push, PR-Vorlage, Labels, Assignee, `Closes #`-Verknüpfung und das Entfernen des Worktrees.
---

# Arbeiten an GitHub-Issues und Pull Requests

## Arbeiten an GitHub-Issues

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
3. **Implementieren und committen** im Worktree (Conventional Commits, siehe CLAUDE.md).
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

## Pull Requests

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
