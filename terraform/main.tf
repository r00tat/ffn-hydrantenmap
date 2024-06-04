locals {
  project_services = [
    "iam.googleapis.com",
    "artifactregistry.googleapis.com",
    "cloudapis.googleapis.com",
    "cloudbuild.googleapis.com",
    "cloudfunctions.googleapis.com",
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
    "pubsub.googleapis.com",
    "run.googleapis.com",
    "runtimeconfig.googleapis.com",
    "script.googleapis.com",
    "secretmanager.googleapis.com",
    "securetoken.googleapis.com",
    "servicemanagement.googleapis.com",
    "serviceusage.googleapis.com",
    "sheets.googleapis.com",
    # "source.googleapis.com",
    "sql-component.googleapis.com",
    "storage-api.googleapis.com",
    "storage-component.googleapis.com",
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
