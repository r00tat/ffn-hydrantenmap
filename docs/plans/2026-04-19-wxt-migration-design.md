# WXT Migration Design

**Status:** approved
**Date:** 2026-04-19
**Branch:** `feature/wxt-migration`

## Motivation

Dependabot Alert #91 ([GHSA-mw96-cpmx-2vgc](https://github.com/r00tat/ffn-hydrantenmap/security/dependabot/91), CVE-2026-27606, High) flags `rollup@2.79.2` via `@crxjs/vite-plugin`. Das Plugin pinnt rollup in allen Versionen (inkl. aktuellem `2.4.0`) hart auf `2.79.2`; der Upstream-Fix-PR ([crxjs/chrome-extension-tools#1124](https://github.com/crxjs/chrome-extension-tools/pull/1124)) hängt seit Feb 2026. Statt einen temporären `overrides`-Patch zu tragen, migrieren wir die Extension auf [WXT](https://wxt.dev) — aktiver Maintainer, MV3-first, vite-4-Stack (rollup 4), Framework ersetzt crxjs vollständig.

## Scope

- Big-Bang In-Place-Migration im bestehenden `chrome-extension/` Ordner
- Pragmatische Vereinfachung: eigene Env-Overlay- und Git-Version-Logik bleiben erhalten; `scripts/publish-cws.mjs` wird durch `wxt submit` ersetzt; `scripts/package.mjs` (CRX-Signing) bleibt unverändert
- Kein Feature-Umbau, kein Verhaltens-Delta für Endnutzer — nur Tooling-Tausch

## Branch & Git

- Neuer Branch `feature/wxt-migration` von `main` (im git root, kein Worktree)
- Übergangs-Override auf `chrome-extension/package.json` vorher verworfen — die Migration entfernt `@crxjs/vite-plugin` ohnehin komplett, damit verschwindet die verwundbare rollup-2.79.2-Transitiv-Dep und Alert #91 schließt sich automatisch
- Abschluss-PR: englischer Conventional-Commit-Titel, deutsche Beschreibung (CLAUDE.md-Konvention)

## Dependencies

**Entfernt** (`devDependencies`):
- `@crxjs/vite-plugin` → durch WXT ersetzt
- `@vitejs/plugin-react` → kommt via `@wxt-dev/module-react`
- `chrome-webstore-upload` → durch `wxt submit` ersetzt

**Hinzugefügt**:
- `wxt` (dev)
- `@wxt-dev/module-react` (dev)

**Unverändert**: `vite` (WXT-Peer), `crx3` (CRX-Signing im `scripts/package.mjs`), `@types/chrome`, `@types/react`, `@types/react-dom`, `jsdom`, `typescript`, `vitest` sowie sämtliche runtime `dependencies` (Firebase, MUI, React).

**Script-Anpassungen**:
- `dev`: `wxt` (statt `vite`)
- `build`: `tsc --noEmit && wxt build` (statt `... && vite build`)
- `build:prod`: `tsc --noEmit && EXT_ENV_LOCAL=1 wxt build && node scripts/package.mjs`
- `publish:cws`: `npm run build:prod && wxt submit --chrome-zip "$(ls einsatzkarte-*.zip | head -1)"`
- `preview`, `cws:login` entfallen

## Dateistruktur

```
chrome-extension/
├── manifest.config.ts          ─┐
├── vite.config.ts               ├─→  wxt.config.ts  (alles konsolidiert)
├── src/vite-env.d.ts           ─┘
│
├── src/popup/*                  →    entrypoints/popup/*
├── src/background/service-worker.ts → entrypoints/background.ts
├── src/content/sybos.ts + helpers
│   + *.test.ts                  →    entrypoints/sybos.content/
│                                         index.ts (oder sybos.content.ts)
│                                         *-helpers.ts + *.test.ts
│
├── src/shared/                  →    bleibt top-level als src/shared/
│                                         (alias @shared)
├── public/icons/                →    unverändert
├── scripts/package.mjs          →    unverändert (outDir bleibt dist/)
├── scripts/publish-cws.mjs      →    GELÖSCHT
├── vitest.config.ts             →    unverändert
└── tsconfig.json                →    erbt von .wxt/tsconfig.json
```

## `wxt.config.ts`

Vereint `manifest.config.ts` und `vite.config.ts`. Kernpunkte:

- `outDir: 'dist'` — WXT-Default wäre `.output/chrome-mv3`; `dist/` behalten, damit `scripts/package.mjs` und CI unverändert funktionieren
- `manifest: async ({ mode }) => ({...})` — lädt `NEXT_PUBLIC_*` und `CHROME_EXTENSION_PUBLIC_KEY` aus Projekt-Root, optional Overlay aus `chrome-extension/` bei `EXT_ENV_LOCAL=1`; nutzt `resolveVersionFromGit()` (1:1 aus `manifest.config.ts`); setzt `key`, `permissions`, `host_permissions`, `oauth2`, `icons`
- `vite: () => ({ envDir, envPrefix, resolve.alias: { '@shared' }, plugins: [...envOverlayPlugin falls EXT_ENV_LOCAL] })`
- `modules: ['@wxt-dev/module-react']`, `manifestVersion: 3`, `browser: 'chrome'`

Wegfallen: `action.default_popup`, `background.service_worker`, `content_scripts[]` — WXT generiert diese aus den Entrypoints.

## Entrypoint-Refactor

**`entrypoints/background.ts`** — `defineBackground({ type: 'module', main() {...} })`. Bisherige `service-worker.ts`-Logik in `main()` verschieben. `chrome.*` APIs funktionieren unverändert.

**`entrypoints/popup/`** — `index.html` + `main.tsx` + App-Komponenten aus `src/popup/` ohne Code-Änderung.

**`entrypoints/sybos.content/`** (oder `sybos.content.ts` falls einzelne Datei) — `defineContentScript({ matches: ['https://sybos.lfv-bgld.at/*'], runAt: 'document_end', main(ctx) {...} })`. **Kritisch**: WXT importiert Entrypoint-Files in Node beim Build — Top-Level-Runtime-Code (DOM-Access, Seiteneffekte) muss in `main()` wandern. Wird beim konkreten Port geprüft und ggf. refactored.

**`src/shared/`** bleibt top-level, wird von Entrypoints via `@shared`-Alias importiert.

## CI — `.github/workflows/chrome-extension-release.yml`

- „Install" / „Build" / „Patch manifest version" / „Package as .zip and .crx" / „Upload to Drive" / „Cleanup" bleiben
- `dist/manifest.json` wird von WXT am gleichen Ort erzeugt — `jq`-Patch unverändert
- „Publish to Chrome Web Store"-Schritt: `node scripts/publish-cws.mjs` → `npx wxt submit --chrome-zip "${ZIP_FILE}"` mit gleichen Secret-Namen (`CWS_CLIENT_ID`, `CWS_CLIENT_SECRET`, `CWS_REFRESH_TOKEN`, `CWS_EXTENSION_ID`) als ENV

## Sonstiges

- `.gitignore`: `.wxt/` und `.output/` ergänzen
- `tsconfig.json`: `extends: './.wxt/tsconfig.json'`

## Testing & Verifikation

1. `npm run build` — `dist/manifest.json` existiert mit MV3, Permissions, OAuth2, `key`, Version aus Git-Tag
2. `npm run test` — alle bestehenden 7 Content-Script-Tests grün
3. `EXT_ENV_LOCAL=1 npm run build` — `CHROME_EXTENSION_PUBLIC_KEY` landet in manifest
4. Chrome „Unpacked laden" von `dist/` — Popup öffnet, OAuth-Login funktioniert
5. Navigation auf `https://sybos.lfv-bgld.at/*` — Content-Script injiziert
6. `node scripts/package.mjs` — signierte `.crx` + `.zip` entstehen, `.zip` enthält KEIN `key`-Feld
7. `npm run check` im Projekt-Root — Haupt-Next-App unbeeinflusst

## Akzeptanzkriterien

- `dist/manifest.json` semantisch äquivalent zum alten Build
- `chrome-extension/package-lock.json` enthält weder `@crxjs/vite-plugin` noch `rollup@2.x`
- Dependabot Alert #91 schließt sich nach Merge automatisch
- `npm run check` im Projekt-Root grün
- CI-Workflow `chrome-extension-release.yml` läuft durch

## Rollback

Branch verwerfen: `git branch -D feature/wxt-migration`. Keine Nebenwirkungen, da Big-Bang isoliert.
