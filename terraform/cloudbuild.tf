locals {
  artifact_registry = "${google_artifact_registry_repository.run_docker.location}-docker.pkg.dev/${var.project}/${google_artifact_registry_repository.run_docker.repository_id}"
  substitutions = {
    _RUN_SERVICE_ACCOUNT = google_service_account.run_sa.email
    _IMAGE               = "${local.artifact_registry}/${var.name}/dev"
  }
}

resource "google_service_account" "deploy_sa" {
  display_name = "cloudbuild"
  description  = "SA for CICD"
  account_id   = var.deploy_sa
  project      = var.project
}

resource "google_project_iam_member" "deloy_iam" {
  for_each = toset([
    "roles/artifactregistry.admin",
    "roles/run.admin",
    "roles/secretmanager.admin",
    "roles/storage.admin",
    "roles/logging.logWriter",
  ])
  member  = google_service_account.deploy_sa.member
  role    = each.value
  project = var.project
}

resource "google_service_account_iam_member" "cloudbuild_run_sa" {
  member             = google_service_account.deploy_sa.member
  role               = "roles/iam.serviceAccountUser"
  service_account_id = google_service_account.run_sa.id
}

resource "google_cloudbuild_trigger" "feature_branch" {
  location = "global"
  name     = "push-to-feature-branch"
  filename = "cloudbuild.yaml"

  github {
    owner = "r00tat"
    name  = "ffn-hydrantenmap"
    push {
      branch = "^(feature|bugfix|enhancement)/.*$"
    }
  }

  include_build_logs = "INCLUDE_BUILD_LOGS_WITH_STATUS"
  service_account    = "projects/${var.project}/serviceAccounts/${var.build_service_account}"

  substitutions = local.substitutions
}


resource "google_cloudbuild_trigger" "build_main_branch" {
  location = "global"
  name     = "build-main-branch"
  filename = "cloudbuild.yaml"

  github {
    owner = "r00tat"
    name  = "ffn-hydrantenmap"
    push {
      branch = "^main$"
    }
  }

  include_build_logs = "INCLUDE_BUILD_LOGS_WITH_STATUS"
  service_account    = "projects/${var.project}/serviceAccounts/${var.build_service_account}"
  substitutions      = local.substitutions
}
resource "google_cloudbuild_trigger" "deploy_prod_on_tag" {
  location = "global"
  name     = "deploy-prod-on-tag"
  filename = "cloudbuild.yaml"

  github {
    owner = "r00tat"
    name  = "ffn-hydrantenmap"
    push {
      tag = ".*"
    }
  }

  include_build_logs = "INCLUDE_BUILD_LOGS_WITH_STATUS"
  service_account    = "projects/${var.project}/serviceAccounts/${var.build_service_account}"

  substitutions = merge(local.substitutions, {
    _NEXT_PUBLIC_FIRESTORE_DB = ""
    _SERVICE_NAME             = var.name
    _IMAGE                    = "${local.artifact_registry}/${var.name}/tag"
  })
}
