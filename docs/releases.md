# Releases

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
