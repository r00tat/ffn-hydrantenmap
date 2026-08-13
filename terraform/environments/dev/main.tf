locals {
  # Repository-Wurzel, von terraform/environments/dev aus gesehen.
  repo_root = "${path.root}/../../.."

  # Environment-Identität: dev hat eine eigene, von terraform verwaltete
  # Datenbank. Diese Werte sind absichtlich nicht variabel.
  database_name   = "ffndev"
  create_database = true
  location_id     = "eur3"

  artifact_registry = "${var.run_region}-docker.pkg.dev/${var.project}/hydrantenkarte"
}

module "project_base" {
  count  = var.manage_project_base ? 1 : 0
  source = "../../modules/project-base"

  project            = var.project
  region             = var.region
  run_region         = var.run_region
  name               = var.name
  run_sa             = var.run_sa
  deploy_sa          = var.deploy_sa
  github_org         = var.github_org
  github_repo        = var.github_repo
  state_bucket       = var.state_bucket
  storage_rules_file = "${local.repo_root}/storage.rules"
}

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

  # Aus Variablen abgeleitet statt aus module.project_base-Outputs: so
  # funktioniert der Root identisch, ob dieses Environment die Projekt-Basis
  # besitzt oder sie mit einem anderen teilt.
  substitutions = {
    _RUN_SERVICE_ACCOUNT      = "${var.run_sa}@${var.project}.iam.gserviceaccount.com"
    _IMAGE                    = "${local.artifact_registry}/${var.name}/dev"
    _NEXT_PUBLIC_FIRESTORE_DB = local.database_name
  }
}

module "cloud_scheduler" {
  source = "../../modules/cloud-scheduler"

  project    = var.project
  run_region = var.run_region
  # `var.name` ist in beiden Umgebungen auf "hydrantenmap" voreingestellt, der
  # Dev-Dienst heißt laut service.yaml aber "hydrantenmap-dev".
  service_name = "${var.name}-dev"
  service_url  = var.run_service_url

  # Pausiert: Dev und Prod lesen dieselbe `fahrtenbuchConfig`-Struktur, und zwei
  # Umgebungen dürfen nicht dieselbe Verteilerliste bemailen. Zum Prüfen in Dev
  # den Job von Hand auslösen oder `dryRun` verwenden.
  weekly_report_paused = true
}
