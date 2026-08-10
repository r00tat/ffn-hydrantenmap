resource "google_cloudbuild_trigger" "this" {
  for_each = var.triggers

  project  = var.project
  location = "global"
  name     = each.key
  filename = "cloudbuild.yaml"

  github {
    owner = var.github_owner
    name  = var.github_repo

    push {
      branch = each.value.branch
      tag    = each.value.tag
    }
  }

  include_build_logs = "INCLUDE_BUILD_LOGS_WITH_STATUS"
  service_account    = "projects/${var.project}/serviceAccounts/${var.build_service_account}"

  substitutions = var.substitutions
  disabled      = var.disabled
}
