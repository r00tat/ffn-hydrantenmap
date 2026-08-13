locals {
  # Repository-Wurzel, von terraform/environments/prod aus gesehen.
  repo_root = "${path.root}/../../.."

  # Environment-Identität: prod läuft auf der Default-Datenbank, die außerhalb
  # von terraform existiert. Diese Werte sind absichtlich nicht variabel.
  database_name   = "(default)"
  create_database = false

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
  rules_file      = "${local.repo_root}/firebase/prod/firestore.rules"
  indexes_file    = "${local.repo_root}/firebase/prod/firestore.indexes.json"
}

module "cloudbuild" {
  source = "../../modules/cloudbuild-triggers"

  project               = var.project
  github_owner          = var.github_org
  github_repo           = var.github_repo
  build_service_account = var.build_service_account
  disabled              = var.cloudbuild_disabled

  triggers = {
    "deploy-prod-on-tag" = { tag = ".*" }
  }

  # Aus Variablen abgeleitet statt aus module.project_base-Outputs: so
  # funktioniert der Root identisch, ob dieses Environment die Projekt-Basis
  # besitzt oder sie mit einem anderen teilt.
  substitutions = {
    _RUN_SERVICE_ACCOUNT      = "${var.run_sa}@${var.project}.iam.gserviceaccount.com"
    _IMAGE                    = "${local.artifact_registry}/${var.name}/tag"
    _NEXT_PUBLIC_FIRESTORE_DB = ""
    _SERVICE_NAME             = var.name
  }
}

module "cloud_scheduler" {
  source = "../../modules/cloud-scheduler"

  project      = var.project
  run_region   = var.run_region
  service_name = var.name
  service_url  = var.run_service_url

  # Der Scheduler-Job braucht cloudscheduler.googleapis.com, aktiviert von der
  # Projekt-Basis. Ohne diese Kante könnte terraform beides gleichzeitig anlegen
  # und der Job auf einer noch nicht aktivierten API scheitern.
  depends_on = [module.project_base]
}
