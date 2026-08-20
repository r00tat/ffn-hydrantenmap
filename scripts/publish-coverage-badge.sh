#!/usr/bin/env bash
# Schreibt den Coverage-Stand von main auf den verwaisten Branch `badges`.
#
# Dort liegen zwei Dateien:
#   coverage-badge.json    Shields-Endpoint, den das README als Badge einbindet
#   coverage-summary.json  Vergleichsstand, aus dem der PR-Kommentar sein Delta
#                          rechnet
#
# Ein eigener Branch, weil beide Dateien sich bei fast jedem Push ändern: in
# main wäre das ein Bot-Commit je Push, der die Historie unlesbar macht und —
# ohne [skip ci] — jedes Mal einen weiteren Deploy anstößt. `badges` hat keinen
# gemeinsamen Verlauf mit main und wird von keinem Workflow beobachtet.
#
# Erwartet coverage/coverage-summary.json im Arbeitsverzeichnis und $GH_TOKEN.
set -euo pipefail

SUMMARY="${1:-coverage/coverage-summary.json}"
BRANCH="badges"

if [[ ! -f "$SUMMARY" ]]; then
  echo "::error::$SUMMARY nicht gefunden" >&2
  exit 1
fi

# Lines statt Statements: das ist die Zahl, die auch der HTML-Report und die
# IDE-Anzeige als "Coverage" führen.
pct="$(jq -r '.total.lines.pct' "$SUMMARY")"

# Dieselben Schwellen wie die Ampel im PR-Kommentar, damit Badge und Kommentar
# nicht unterschiedlich urteilen.
color="red"
if awk "BEGIN { exit !($pct >= 90) }"; then
  color="brightgreen"
elif awk "BEGIN { exit !($pct >= 80) }"; then
  color="green"
elif awk "BEGIN { exit !($pct >= 70) }"; then
  color="yellowgreen"
elif awk "BEGIN { exit !($pct >= 60) }"; then
  color="yellow"
elif awk "BEGIN { exit !($pct >= 50) }"; then
  color="orange"
fi

work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT

jq -n --arg msg "${pct}%" --arg color "$color" \
  '{schemaVersion: 1, label: "coverage", message: $msg, color: $color}' \
  >"$work/coverage-badge.json"
cp "$SUMMARY" "$work/coverage-summary.json"

git -C "$work" init -q -b "$BRANCH"
git -C "$work" remote add origin \
  "https://x-access-token:${GH_TOKEN}@github.com/${GITHUB_REPOSITORY}.git"

# Der Branch existiert beim ersten Lauf noch nicht — dann bleibt es beim
# frischen init und der Push legt ihn an.
if git -C "$work" fetch -q --depth 1 origin "$BRANCH" 2>/dev/null; then
  git -C "$work" reset -q --soft FETCH_HEAD
fi

git -C "$work" add -A
if git -C "$work" diff --cached --quiet; then
  echo "Coverage unverändert bei ${pct}% — nichts zu pushen."
  exit 0
fi

git -C "$work" -c user.name="github-actions[bot]" \
  -c user.email="41898282+github-actions[bot]@users.noreply.github.com" \
  commit -q -m "chore: Coverage ${pct}% (${GITHUB_SHA:0:7})"
git -C "$work" push -q origin "$BRANCH"
echo "Badge auf ${pct}% (${color}) aktualisiert."
