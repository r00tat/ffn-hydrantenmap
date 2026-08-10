resource "google_project_service" "apis" {
  for_each                   = toset(var.project_services)
  project                    = var.project
  service                    = each.value
  disable_dependent_services = false
  disable_on_destroy         = false
}

resource "google_service_account" "run_sa" {
  display_name = var.name
  account_id   = var.run_sa
  project      = var.project
}

resource "google_project_iam_member" "run_iam" {
  for_each = toset([
    "roles/firebase.admin",
    "roles/aiplatform.user",
    # Die Routes API wird mit OAuth und `X-Goog-User-Project` aufgerufen, damit
    # Kontingent und Abrechnung diesem Projekt zugeordnet werden. Der Header
    # verlangt `serviceusage.services.use` — in den beiden Rollen darüber ist
    # das nicht verlässlich enthalten, sonst antwortete der Aufruf mit 403.
    "roles/serviceusage.serviceUsageConsumer",
  ])
  member  = google_service_account.run_sa.member
  role    = each.value
  project = var.project
}

resource "google_service_account" "deploy_sa" {
  display_name = "cloudbuild"
  description  = "SA for CICD"
  account_id   = var.deploy_sa
  project      = var.project
}

resource "google_project_iam_member" "deploy_iam" {
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

# ============================================================================
# Artifact Registry
#
# Es gibt die Registry `hydrantenkarte` zweimal: einmal in var.region und
# einmal in var.run_region. Historisch gewachsen, beide werden noch
# referenziert. Absichtlich nicht zusammengelegt — das wäre eine
# Image-Migration und gehört in einen eigenen Schritt.
# ============================================================================

resource "google_artifact_registry_repository" "run_docker" {
  project       = var.project
  location      = var.region
  repository_id = "hydrantenkarte"
  description   = "Docker registry for cloud run service hydrantenmap"
  format        = "DOCKER"

  docker_config {
    immutable_tags = false
  }

  cleanup_policies {
    id     = "keep-releases"
    action = "KEEP"
    condition {
      tag_state             = "TAGGED"
      version_name_prefixes = ["v"]
    }
  }
  cleanup_policies {
    id     = "delete—untagged—30d"
    action = "DELETE"
    condition {
      tag_state  = "UNTAGGED"
      older_than = "${30 * 24 * 60 * 60}s"
    }
  }
}

# Die tatsächlich vom Deploy benutzte Registry.
resource "google_artifact_registry_repository" "run_docker2" {
  project       = var.project
  location      = var.run_region
  repository_id = "hydrantenkarte"
  description   = "Docker registry for cloud run service hydrantenmap"
  format        = "DOCKER"

  docker_config {
    immutable_tags = false
  }

  cleanup_policies {
    id     = "keep-releases"
    action = "KEEP"
    condition {
      tag_state             = "TAGGED"
      version_name_prefixes = ["v"]
    }
  }
  cleanup_policies {
    id     = "delete—untagged—30d"
    action = "DELETE"
    condition {
      tag_state  = "UNTAGGED"
      older_than = "${30 * 24 * 60 * 60}s"
    }
  }
}

resource "google_artifact_registry_repository" "dockerhub_cache" {
  project       = var.project
  location      = var.run_region
  repository_id = "dockerhub"
  description   = "Pull-through cache for Docker Hub to avoid rate limits"
  format        = "DOCKER"
  mode          = "REMOTE_REPOSITORY"

  remote_repository_config {
    description = "Docker Hub mirror"
    docker_repository {
      public_repository = "DOCKER_HUB"
    }
  }

  cleanup_policies {
    id     = "delete-stale-90d"
    action = "DELETE"
    condition {
      older_than = "${90 * 24 * 60 * 60}s"
    }
  }
}
