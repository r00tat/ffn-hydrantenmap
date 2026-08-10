resource "google_firebase_project" "default" {
  provider = google-beta
  project  = var.project
}

# ============================================================================
# Storage Rules
#
# Gelten für den einen Storage-Bucket des Projekts und sind deshalb
# Projekt-Ebene, nicht Environment-Ebene.
# ============================================================================

resource "google_firebaserules_ruleset" "storage" {
  project = var.project

  source {
    files {
      content = file(var.storage_rules_file)
      name    = "storage.rules"
    }
  }
}

resource "google_firebaserules_release" "storage" {
  name         = "firebase.storage/${var.project}.appspot.com"
  project      = var.project
  ruleset_name = "projects/${var.project}/rulesets/${google_firebaserules_ruleset.storage.name}"
}
