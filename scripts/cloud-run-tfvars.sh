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
Usage: cloud-run-tfvars.sh --env dev|prod [--image IMAGE] [--version REF]
       cloud-run-tfvars.sh --service NAME --project ID --region REGION --out FILE
                           [--image IMAGE] [--version REF]
                           [--keep N | --keep-branches]
       cloud-run-tfvars.sh --print-tag --version REF

Lokal genuegt `npm run tfvars:dev` bzw. `npm run tfvars:prod`.

  -e, --env NAME        Umgebung (dev|prod). Leitet Projekt, Region,
                        Dienstnamen, Zieldatei und Aufbewahrungsregel aus
                        terraform/environments/NAME ab — dann entfallen die
                        vier Optionen darunter. Einzeln gesetzte Optionen
                        haben Vorrang.
  -s, --service NAME    Name des Cloud-Run-Dienstes
  -p, --project ID      GCP-Projekt
  -r, --region REGION   Region des Dienstes
  -o, --out FILE        Zieldatei (…/cloudrun.auto.tfvars.json)
  -i, --image IMAGE     Neu gebautes Image. Fehlt es, wird das laufende übernommen.
  -v, --version REF     Git-Ref oder Version des Deploys, z.B. refs/tags/v2.63.0
                        oder ein Branchname. Wird zu Tag und Revisions-Suffix.
  -k, --keep N          Die N jüngsten Tags behalten.
  -b, --keep-branches   Nur Tags behalten, deren Branch auf origin noch existiert.
  -t, --print-tag       Nur den normalisierten Tag ausgeben und beenden (kein GCP).
  -h, --help            Diese Hilfe.

Lange Optionen nehmen ihren Wert als naechstes Argument oder mit
Gleichheitszeichen: --keep 20 und --keep=20 sind gleichwertig.
EOF
  exit "${1:-2}"
}

ENVIRONMENT="" SERVICE="" PROJECT="" REGION="" OUT="" IMAGE="" VERSION="" KEEP="" KEEP_BRANCHES=0 PRINT_TAG=0

# getopts kennt von Haus aus nur kurze Optionen. Das ':-' in der Optionsliste
# macht '-' zu einer Option mit Argument: Aus '--keep=20' wird dann opt='-' mit
# OPTARG='keep=20', aus '--keep' entsprechend OPTARG='keep'. Der Block darunter
# rechnet beides auf denselben Namen und Wert um, sodass das eigentliche case
# lange und kurze Schreibweise gemeinsam behandelt.
#
# Der Doppelpunkt am Anfang schaltet getopts' eigene Fehlermeldungen ab — die
# Faelle ':' (Wert fehlt) und '?' (unbekannt) werden unten selbst beantwortet.
while getopts ':e:s:p:r:o:i:v:k:bth-:' opt; do
  if [[ "$opt" == "-" ]]; then
    if [[ "$OPTARG" == *=* ]]; then
      opt="${OPTARG%%=*}"
      OPTARG="${OPTARG#*=}"
    else
      opt="$OPTARG"
      case "$opt" in
        env | service | project | region | out | image | version | keep)
          # Wert steht im naechsten Argument.
          OPTARG="${!OPTIND:-}"
          if [[ -z "$OPTARG" ]]; then
            echo "::error::--${opt} braucht einen Wert." >&2
            exit 2
          fi
          OPTIND=$((OPTIND + 1))
          ;;
        *) OPTARG="" ;;
      esac
    fi
  fi

  case "$opt" in
    e | env) ENVIRONMENT="$OPTARG" ;;
    s | service) SERVICE="$OPTARG" ;;
    p | project) PROJECT="$OPTARG" ;;
    r | region) REGION="$OPTARG" ;;
    o | out) OUT="$OPTARG" ;;
    i | image) IMAGE="$OPTARG" ;;
    v | version) VERSION="$OPTARG" ;;
    k | keep) KEEP="$OPTARG" ;;
    b | keep-branches) KEEP_BRANCHES=1 ;;
    t | print-tag) PRINT_TAG=1 ;;
    h | help) usage 0 ;;
    :)
      echo "::error::-${OPTARG} braucht einen Wert." >&2
      exit 2
      ;;
    *)
      echo "::error::Unbekannte Option: ${OPTARG:-$opt}" >&2
      usage
      ;;
  esac
done
shift $((OPTIND - 1))

if [[ $# -gt 0 ]]; then
  echo "::error::Unerwartete Argumente: $*" >&2
  usage
fi

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

# --env leitet ab, was ohnehin schon in terraform steht: Projekt, Region und
# Dienstname. So steht die Projekt-ID nicht ein zweites Mal in package.json und
# der Dienstname nicht ein drittes Mal irgendwo daneben. Einzeln gesetzte
# Optionen gewinnen, damit der Workflow weiter explizit aufrufen kann.
if [[ -n "$ENVIRONMENT" ]]; then
  repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
  tf_root="$repo_root/terraform/environments/$ENVIRONMENT"

  if [[ ! -d "$tf_root" ]]; then
    echo "::error::Kein Terraform-Root fuer '$ENVIRONMENT': $tf_root" >&2
    exit 2
  fi

  # `local.service_name` traegt in dev das '-dev' — deshalb terraform fragen
  # statt den Namen nachzubauen.
  resolved="$(printf 'var.project\nvar.run_region\nlocal.service_name\n' \
    | (cd "$tf_root" && tofu console 2>/dev/null) | tr -d '"')" || resolved=""
  tf_project="" tf_region="" tf_service=""
  { read -r tf_project; read -r tf_region; read -r tf_service; } <<<"$resolved" || true

  if [[ -z "$tf_project" || -z "$tf_region" || -z "$tf_service" ]]; then
    echo "::error::Projekt, Region und Dienstname liessen sich nicht aus ${tf_root} lesen." >&2
    echo "::error::Dort einmal 'tofu init' laufen lassen — 'tofu console' braucht einen initialisierten Root." >&2
    exit 2
  fi

  SERVICE="${SERVICE:-$tf_service}"
  PROJECT="${PROJECT:-$tf_project}"
  REGION="${REGION:-$tf_region}"
  OUT="${OUT:-$tf_root/cloudrun.auto.tfvars.json}"

  # Aufbewahrungsregel je Umgebung. Muss zu den Flags in
  # .github/workflows/cloud-run.yml passen — dort steht sie explizit, weil der
  # Deploy-Job das Skript vor `tofu init` aufruft und `tofu console` deshalb
  # nicht zur Verfuegung hat.
  if [[ -z "$KEEP" && "$KEEP_BRANCHES" -eq 0 ]]; then
    case "$ENVIRONMENT" in
      prod) KEEP=20 ;;
      *) KEEP_BRANCHES=1 ;;
    esac
  fi
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
