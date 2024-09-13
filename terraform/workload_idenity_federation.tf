resource "google_iam_workload_identity_pool" "github" {
  workload_identity_pool_id = "github"
  display_name              = "Github"
  description               = "Identity pool for github"
}

resource "google_iam_workload_identity_pool_provider" "github" {
  provider                           = google
  project                            = var.project
  workload_identity_pool_id          = google_iam_workload_identity_pool.github.workload_identity_pool_id
  workload_identity_pool_provider_id = "github"

  attribute_mapping = {
    "google.subject"          = "assertion.sub"
    "attribute.actor"         = "assertion.actor"
    "attribute.aud"           = "assertion.aud"
    "attribute.repository"    = "assertion.repository"
    "attribute.workflow"      = "assertion.workflow"
    "attribute.repository_id" = "assertion.repository_id"
    "attribute.aud"           = "assertion.aud"
    "attribute.actor"         = "assertion.actor"
    "attribute.repository"    = "assertion.repository"
    "attribute.ref"           = "assertion.ref"
  }

  oidc {
    issuer_uri = "https://token.actions.githubusercontent.com"
  }

  attribute_condition = "assertion.repository_owner=='${var.github_org}'"
}
