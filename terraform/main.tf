locals {
  project_services = [
    "iam.googleapis.com",
    "artifactregistry.googleapis.com",
    "cloudapis.googleapis.com",
    "cloudbuild.googleapis.com",
    # "cloudfunctions.googleapis.com",
    "cloudresourcemanager.googleapis.com",
    "cloudtrace.googleapis.com",
    "containerregistry.googleapis.com",
    "datastore.googleapis.com",
    "drive.googleapis.com",
    "eventarc.googleapis.com",
    "fcm.googleapis.com",
    "fcmregistrations.googleapis.com",
    "firebase.googleapis.com",
    "firebaseappdistribution.googleapis.com",
    "firebasedynamiclinks.googleapis.com",
    "firebasehosting.googleapis.com",
    "firebaseinstallations.googleapis.com",
    "firebaseremoteconfig.googleapis.com",
    "firebaserules.googleapis.com",
    "firebasestorage.googleapis.com",
    "firestore.googleapis.com",
    "firestorekeyvisualizer.googleapis.com",
    "gmail.googleapis.com",
    "googlecloudmessaging.googleapis.com",
    "iam.googleapis.com",
    "iamcredentials.googleapis.com",
    "identitytoolkit.googleapis.com",
    "logging.googleapis.com",
    "mobilecrashreporting.googleapis.com",
    "monitoring.googleapis.com",
    "places.googleapis.com",
    # "pubsub.googleapis.com",
    "run.googleapis.com",
    "runtimeconfig.googleapis.com",
    "script.googleapis.com",
    "secretmanager.googleapis.com",
    # "securetoken.googleapis.com",
    "servicemanagement.googleapis.com",
    "serviceusage.googleapis.com",
    "sheets.googleapis.com",
    # "source.googleapis.com",
    # "sql-component.googleapis.com",
    # "storage-api.googleapis.com",
    # "storage-component.googleapis.com",
    "storage.googleapis.com",
    "testing.googleapis.com",
    "texttospeech.googleapis.com",
  ]
}
resource "google_project_service" "apis" {
  for_each                   = toset(local.project_services)
  project                    = var.project
  service                    = each.value
  disable_dependent_services = false
  disable_on_destroy         = false
}

resource "google_service_account" "run_sa" {
  display_name = "hydrantenmap"
  account_id   = var.run_sa
  project      = var.project
}

resource "google_project_iam_member" "run_iam" {
  for_each = toset([
    "roles/firebase.admin",
  ])
  member  = google_service_account.run_sa.member
  role    = each.value
  project = var.project
}

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
  # cleanup_policies {
  #   id     = "delete—tagged—30d"
  #   action = "DELETE"
  #   condition {
  #     tag_state  = "TAGGED"
  #     older_than = "30d"

  #   }
  # }
}
