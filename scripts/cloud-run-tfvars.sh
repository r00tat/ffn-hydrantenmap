#!/usr/bin/env bash
#
# Erzeugt die Deploy-Variablen für terraform/modules/cloud-run als
# cloudrun.auto.tfvars.json.
#
# Warum ein Skript und nicht nur terraform: Der `traffic`-Block ist autoritativ.
# Was nicht drinsteht, verliert seinen Tag — und ein Tag hält seine Revision
# adressierbar und damit dauerhaft aus Cloud Runs automatischer Bereinigung
# (Limit 1000 Revisionen je Dienst, 2000 Tags je Projekt und Region). Die
# Historie, die erhalten bleiben soll, muss also bei jedem apply vollständig
# vorliegen. Sie steht nicht im Git, sondern im laufenden Dienst; hier wird sie
# gelesen und nach der Aufbewahrungsregel gefiltert.
#
# Zwei Aufbewahrungsregeln:
#   --keep N          die N jüngsten Tags behalten (prod: das Rollback-Fenster)
#   --keep-branches   nur Tags behalten, zu denen es auf origin noch einen
#                     Branch gibt (dev: gemergter Branch => Tag verschwindet)
#
# Ohne --image werden Image und Revisions-Suffix aus dem laufenden Dienst
# gelesen. So kann ein apply, der nur Firestore-Regeln ändert, die App nicht
# versehentlich auf ein altes Image zurückdrehen.

set -euo pipefail

usage() {
  cat >&2 <<'EOF'
Usage: cloud-run-tfvars.sh --service NAME --project ID --region REGION --out FILE
                           [--image IMAGE] [--version REF]
                           [--keep N | --keep-branches]
       cloud-run-tfvars.sh --print-tag --version REF

  --service         Name des Cloud-Run-Dienstes
  --project         GCP-Projekt
  --region          Region des Dienstes
  --out             Zieldatei (…/cloudrun.auto.tfvars.json)
  --image           Neu gebautes Image. Fehlt es, wird das laufende übernommen.
  --version         Git-Ref oder Version des Deploys, z.B. refs/tags/v2.63.0
                    oder ein Branchname. Wird zu Tag und Revisions-Suffix.
  --keep N          Die N jüngsten Tags behalten.
  --keep-branches   Nur Tags behalten, deren Branch auf origin noch existiert.
  --print-tag       Nur den normalisierten Tag ausgeben und beenden (kein GCP).
EOF
  exit 2
}

SERVICE="" PROJECT="" REGION="" OUT="" IMAGE="" VERSION="" KEEP="" KEEP_BRANCHES=0 PRINT_TAG=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --print-tag) PRINT_TAG=1; shift ;;
    --service) SERVICE="$2"; shift 2 ;;
    --project) PROJECT="$2"; shift 2 ;;
    --region) REGION="$2"; shift 2 ;;
    --out) OUT="$2"; shift 2 ;;
    --image) IMAGE="$2"; shift 2 ;;
    --version) VERSION="$2"; shift 2 ;;
    --keep) KEEP="$2"; shift 2 ;;
    --keep-branches) KEEP_BRANCHES=1; shift ;;
    -h|--help) usage ;;
    *) echo "Unbekanntes Argument: $1" >&2; usage ;;
  esac
done

# Normalisiert einen Git-Ref auf einen Cloud-Run-Tag: Kleinbuchstaben, nur
# [a-z0-9-], höchstens 30 Zeichen, kein Bindestrich am Ende. Die einzige
# Implementierung dieser Abbildung — der Workflow ruft für den Image-Tag
# `--print-tag` auf, statt sie ein zweites Mal in sed nachzubauen.
sanitize_tag() {
  local raw="$1"
  raw="${raw#refs/tags/}"
  raw="${raw#refs/heads/}"
  printf '%s' "$raw" \
    | tr '[:upper:]' '[:lower:]' \
    | sed -E 's@[^a-z0-9-]+@-@g; s@-+@-@g; s@^-@@' \
    | cut -c1-30 \
    | sed -E 's@-$@@'
}

# Nur den Tag ausgeben — ohne GCP-Zugriff, damit der Build-Job ihn ohne
# Anmeldung bilden kann.
if [[ "$PRINT_TAG" -eq 1 ]]; then
  [[ -n "$VERSION" ]] || { echo "--print-tag braucht --version" >&2; exit 2; }
  sanitize_tag "$VERSION"
  echo
  exit 0
fi

[[ -n "$SERVICE" && -n "$PROJECT" && -n "$REGION" && -n "$OUT" ]] || usage

# Genau eine Aufbewahrungsregel. Ohne Regel würde die Tag-Liste unbegrenzt
# wachsen — der Zustand, den dieser Umbau gerade beendet.
if [[ -n "$KEEP" && "$KEEP_BRANCHES" -eq 1 ]]; then
  echo "::error::--keep und --keep-branches schließen sich aus." >&2
  exit 2
fi
if [[ -z "$KEEP" && "$KEEP_BRANCHES" -eq 0 ]]; then
  echo "::error::Eine Aufbewahrungsregel ist Pflicht: --keep N oder --keep-branches." >&2
  exit 2
fi

# Über Dateien statt über Variablen: Der Dienst trägt mehr als hundert
# Traffic-Einträge und dev über neunhundert Revisionen — als jq-Argument
# scheitert das an der Größe der Argumentliste.
tmpdir="$(mktemp -d)"
trap 'rm -rf "$tmpdir"' EXIT

if ! gcloud run services describe "$SERVICE" \
  --project "$PROJECT" --region "$REGION" --format=json >"$tmpdir/live.json" 2>/dev/null; then
  echo '{}' >"$tmpdir/live.json"
fi

# Revisionen, die es wirklich noch gibt, neueste zuerst. Ein Tag auf einer von
# Cloud Run bereinigten Revision ließe den apply scheitern.
gcloud run revisions list --service "$SERVICE" \
  --project "$PROJECT" --region "$REGION" \
  --format='value(metadata.name)' --sort-by='~metadata.creationTimestamp' \
  >"$tmpdir/revisions.txt" 2>/dev/null || : >"$tmpdir/revisions.txt"

new_tag=""
[[ -n "$VERSION" ]] && new_tag="$(sanitize_tag "$VERSION")"

if [[ -z "$IMAGE" ]]; then
  # Kein Deploy: Image und Suffix aus dem laufenden Dienst übernehmen, keinen
  # neuen Tag setzen.
  IMAGE="$(jq -r '.spec.template.spec.containers[0].image // ""' "$tmpdir/live.json")"
  revision_suffix="$(jq -r '.spec.template.metadata.labels["deploy-version"] // ""' "$tmpdir/live.json")"
  new_tag=""

  if [[ -z "$IMAGE" ]]; then
    echo "::error::Dienst ${SERVICE} existiert nicht und --image fehlt — es gibt kein Image, das terraform ausrollen könnte." >&2
    exit 1
  fi
else
  revision_suffix="$new_tag"
fi

# Tags, zu denen es auf origin noch einen Branch gibt. Schlägt die Abfrage fehl
# (kein Netz, kein origin), bleibt die Liste leer und die Filterung wird unten
# übersprungen: lieber einen Tag zu viel behalten als eine Rollback-Möglichkeit
# wegen eines Netzwerkfehlers löschen.
live_branch_tags='[]'
if [[ "$KEEP_BRANCHES" -eq 1 ]]; then
  branches="$(git ls-remote --heads origin 2>/dev/null | sed 's@.*refs/heads/@@' || true)"
  if [[ -n "$branches" ]]; then
    live_branch_tags="$(while IFS= read -r b; do
      [[ -n "$b" ]] && printf '%s\n' "$(sanitize_tag "$b")"
    done <<<"$branches" | jq -Rsc 'split("\n") | map(select(length > 0))')"
  else
    echo "Warnung: konnte die Branches auf origin nicht lesen — behalte alle Tags." >&2
  fi
fi

retained="$(jq -n \
  --slurpfile live "$tmpdir/live.json" \
  --rawfile revs "$tmpdir/revisions.txt" \
  --argjson branch_tags "$live_branch_tags" \
  --arg new_tag "$new_tag" \
  --arg keep "${KEEP:-}" \
  '
  # Revisionen, neueste zuerst -> Rang je Revisionsname
  (($revs | split("\n") | map(select(length > 0)))
    | to_entries | map({key: .value, value: .key}) | from_entries) as $rank

  | [ $live[0].status.traffic[]? | select(.tag) | {tag: .tag, rev: .revisionName} ]
    # Tags auf verschwundenen Revisionen fliegen immer raus.
    | map(select($rank[.rev] != null))
    # Der Tag dieses Deploys wird von terraform selbst gesetzt (er zeigt auf die
    # Revision, die dieser apply erst anlegt).
    | map(select(.tag != $new_tag))
    | sort_by($rank[.rev])
    | (if ($branch_tags | length) > 0
       then map(select(.tag as $t | $branch_tags | index($t)))
       else . end)
    | (if $keep != "" then .[0:($keep | tonumber)] else . end)
    | map({key: .tag, value: .rev})
    | from_entries
  ')"

mkdir -p "$(dirname "$OUT")"
jq -n \
  --arg image "$IMAGE" \
  --arg revision_suffix "$revision_suffix" \
  --arg revision_tag "$new_tag" \
  --argjson retained_tags "$retained" \
  '{image: $image, revision_suffix: $revision_suffix, revision_tag: $revision_tag, retained_tags: $retained_tags}' \
  >"$OUT"

echo "Deploy-Variablen für ${SERVICE}:"
jq '{image, revision_suffix, revision_tag, retained_tag_count: (.retained_tags | length)}' "$OUT" >&2
