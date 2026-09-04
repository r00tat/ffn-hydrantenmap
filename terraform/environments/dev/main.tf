locals {
  # Repository-Wurzel, von terraform/environments/dev aus gesehen.
  repo_root = "${path.root}/../../.."

  # Environment-Identität: dev hat eine eigene, von terraform verwaltete
  # Datenbank. Diese Werte sind absichtlich nicht variabel.
  database_name   = "ffndev"
  create_database = true
  location_id     = "eur3"

  # `var.name` ist in beiden Umgebungen auf "hydrantenmap" voreingestellt, der
  # Dev-Dienst heißt aber "hydrantenmap-dev".
  service_name      = "${var.name}-dev"
  artifact_registry = "${var.run_region}-docker.pkg.dev/${var.project}/hydrantenkarte"

  # Allowlist für cronRequired. Sie enthält die Invoker **beider** Umgebungen,
  # weil dev und prod dasselbe Projekt teilen; unterschieden werden sie über
  # `name_suffix` des Moduls cloud-scheduler.
  #
  # Bewusst als Zeichenkette gebaut statt aus module.cloud_scheduler: Der
  # Dienst liest diesen Wert, und der Scheduler braucht die URL des Dienstes —
  # eine Referenz auf das Modul ergäbe einen Zyklus. Der `check`-Block unten
  # hält die Konstruktion ehrlich.
  cron_invoker_emails = join(",", [
    for suffix in ["", "-dev"] :
    "fahrtenbuch-report-invoker${suffix}@${var.project}.iam.gserviceaccount.com"
  ])

  # Die Warteschlange der Atemschutz-Termine. Name und Pfad stehen hier, weil
  # **beide** Seiten sie brauchen: das Modul legt die Queue an, der Dienst liest
  # ihren Pfad aus der Umgebung. Aus einem Modul-Output gelesen ergäbe das
  # denselben Zyklus wie bei `cron_invoker_emails` — der Dienst hängt am Wert,
  # die Queue an der URL des Dienstes.
  ueberwachung_queue = "atemschutz-ueberwachung-dev"
  # Die Region der Queue ist `var.tasks_region` und nicht `var.run_region`:
  # Cloud Tasks kennt in einem Projekt mit App-Engine-Anwendung nur deren
  # Region. Siehe modules/cloud-scheduler.
  ueberwachung_queue_path = join("/", [
    "projects", var.project,
    "locations", var.tasks_region,
    "queues", local.ueberwachung_queue,
  ])

  # Der Invoker dieser Umgebung — dasselbe Konto, mit dem auch der Zeitplan
  # aufruft, und damit auf `cron_invoker_emails`.
  ueberwachung_invoker = "fahrtenbuch-report-invoker-dev@${var.project}.iam.gserviceaccount.com"
}

# Die Projekt-Basis liegt in terraform/projects/ffn-utils. Dieser Root hat
# sie nie besessen (manage_project_base war hier immer false), es steht
# entsprechend nichts davon in seinem State.

module "firestore" {
  source = "../../modules/firestore-env"

  project         = var.project
  database_name   = local.database_name
  create_database = local.create_database
  location_id     = local.location_id
  rules_file      = "${local.repo_root}/firebase/dev/firestore.rules"
  indexes_file    = "${local.repo_root}/firebase/dev/firestore.indexes.json"
}

module "cloudbuild" {
  source = "../../modules/cloudbuild-triggers"

  project               = var.project
  github_owner          = var.github_org
  github_repo           = var.github_repo
  build_service_account = var.build_service_account
  disabled              = var.cloudbuild_disabled

  triggers = {
    "push-to-feature-branch" = { branch = "^(feature|bugfix|enhancement)/.*$" }
    "build-main-branch"      = { branch = "^main$" }
  }

  # Aus Variablen abgeleitet statt aus den Outputs des Projekt-Roots: ein
  # Environment-Root liest keinen fremden State.
  substitutions = {
    _RUN_SERVICE_ACCOUNT      = "${var.run_sa}@${var.project}.iam.gserviceaccount.com"
    _IMAGE                    = "${local.artifact_registry}/${var.name}/dev"
    _NEXT_PUBLIC_FIRESTORE_DB = local.database_name
  }
}

module "cloud_run" {
  source = "../../modules/cloud-run"

  project               = var.project
  run_region            = var.run_region
  name                  = local.service_name
  service_account_email = "${var.run_sa}@${var.project}.iam.gserviceaccount.com"

  # Aus scripts/cloud-run-tfvars.sh, siehe cloudrun.auto.tfvars.json.
  image            = var.image
  revision_suffix  = var.revision_suffix
  revision_tag     = var.revision_tag
  retained_tags    = var.retained_tags
  serving_revision = var.serving_revision

  env = {
    NEXTAUTH_URL          = var.public_url
    NEXTAUTH_URL_INTERNAL = "http://localhost:8080"
    GOOGLE_CLOUD_PROJECT  = var.project
    CRON_INVOKER_EMAILS   = local.cron_invoker_emails

    # Termine der Atemschutzwarnungen. Ohne diese beiden Werte plant der Dienst
    # nichts und verlässt sich auf den Zeitplan als Netz — genau der Zustand in
    # der lokalen Entwicklung. Siehe docs/atemschutzueberwachung.md.
    ATEMSCHUTZ_TASKS_QUEUE   = local.ueberwachung_queue_path
    ATEMSCHUTZ_TASKS_INVOKER = local.ueberwachung_invoker

    # NEXT_PUBLIC_* landen beim Build fest im Bundle; zur Laufzeit stehen sie
    # hier nur, weil der Server dieselben Werte für seine eigenen Aufrufe liest.
    NEXT_PUBLIC_FIREBASE_APIKEY = var.firebase_config
    NEXT_PUBLIC_RECAPTCHA_KEY   = var.recaptcha_key

    EINSATZMAPPE_IMPERSONATION_ACCOUNT = var.einsatzmappe_impersonation_account

    # Schreibende MCP-Tools. In dev an, in prod zunächst aus — der Flow soll
    # sich erst in der Praxis bewähren, bevor eine verbundene Anwendung in
    # echte Einsatzdaten schreibt. Siehe docs/mcp-server.md.
    MCP_WRITE_ENABLED = "true"
  }

  # SumUp zeigt in dev auf die Sandbox-Zugangsdaten (Suffix _DEV), alles andere
  # teilen sich beide Umgebungen — sie laufen im selben Projekt.
  secret_env = {
    AUTH_SECRET              = "AUTH_SECRET"
    GOOGLE_SERVICE_ACCOUNT   = "GOOGLE_SERVICE_ACCOUNT"
    BLAULICHTSMS_USERNAME    = "BLAULICHTSMS_USERNAME"
    BLAULICHTSMS_PASSWORD    = "BLAULICHTSMS_PASSWORD"
    BLAULICHTSMS_CUSTOMER_ID = "BLAULICHTSMS_CUSTOMER_ID"
    SUMUP_API_KEY            = "SUMUP_API_KEY_DEV"
    SUMUP_AFFILIATE_KEY      = "SUMUP_AFFILIATE_KEY_DEV"
    SUMUP_MERCHANT_CODE      = "SUMUP_MERCHANT_CODE_DEV"
  }

}

module "cloud_scheduler" {
  source = "../../modules/cloud-scheduler"

  project      = var.project
  run_region   = var.run_region
  service_name = module.cloud_run.name

  # Die Custom Domain, nicht module.cloud_run.uri: Der Dienst läuft unter
  # einsatz-dev.ffnd.at, und `getBaseUrl()` leitet die erwartete Audience aus
  # dem Host des Requests ab. Ein Token auf die run.app-URL passte nicht dazu.
  service_url = var.public_url

  # Die Queue, in die der Dienst seine Termine legt, und das Konto, das sie
  # anlegt. Der Name kommt aus demselben local wie ATEMSCHUTZ_TASKS_QUEUE, damit
  # Dienst und Queue nicht auseinanderlaufen können.
  tasks_queue_name             = local.ueberwachung_queue
  tasks_region                 = var.tasks_region
  caller_service_account_email = "${var.run_sa}@${var.project}.iam.gserviceaccount.com"

  # Dev und Prod teilen das Projekt ffn-utils. Ohne eigenes Suffix legten beide
  # Roots denselben Service Account und denselben Job an, und der zweite apply
  # scheiterte mit 409. Muss zu den Suffixen in `local.cron_invoker_emails`
  # passen, sonst steht dieser Invoker nicht auf der Allowlist — der
  # `check`-Block unten prüft genau das.
  name_suffix = "-dev"

  # Pausiert: Dev und Prod lesen dieselbe `fahrtenbuchConfig`-Struktur, und zwei
  # Umgebungen dürfen nicht dieselbe Verteilerliste bemailen. Zum Prüfen in Dev
  # den Job von Hand auslösen oder `dryRun` verwenden.
  weekly_report_paused = true

}

# Die Allowlist oben wird aus Zeichenketten gebaut, weil eine Referenz auf das
# Scheduler-Modul einen Zyklus ergäbe. Damit die Konstruktion nicht still von
# den tatsächlichen Namen abdriftet, wird sie hier gegengeprüft.
check "cron_invoker_on_allowlist" {
  assert {
    condition = contains(
      split(",", local.cron_invoker_emails),
      module.cloud_scheduler.invoker_service_account_email,
    )
    error_message = "Der Invoker-Service-Account steht nicht auf CRON_INVOKER_EMAILS — cronRequired würde den Wochenbericht mit 403 abweisen."
  }
}

# Der Pfad der Queue steht in der Umgebung des Dienstes und wird — wie die
# Invoker-Allowlist — als Zeichenkette gebaut, weil eine Referenz auf das Modul
# einen Zyklus ergäbe. Läuft die Region auseinander, legt terraform die Queue
# an, der Dienst schreibt aber in eine, die es nicht gibt: Die Termine fielen
# still auf den Netz-Zeitplan zurück.
check "tasks_queue_path_matches" {
  assert {
    condition     = local.ueberwachung_queue_path == module.cloud_scheduler.tasks_queue_path
    error_message = "ATEMSCHUTZ_TASKS_QUEUE zeigt nicht auf die angelegte Cloud-Tasks-Queue — die Termine der Atemschutzüberwachung würden ins Leere laufen."
  }
}
