resource "google_firebase_project" "default" {
  provider = google-beta
  project  = var.project
}

resource "google_firebaserules_release" "prod" {
  name         = "cloud.firestore"
  project      = var.project
  ruleset_name = "projects/${var.project}/rulesets/${google_firebaserules_ruleset.prod.name}"
}

resource "google_firebaserules_ruleset" "prod" {
  project = var.project

  source {
    files {
      content = file("../firebase/prod/firestore.rules")
      name    = "firestore.rules"
    }
  }
}
resource "google_firebaserules_release" "dev" {
  name         = "cloud.firestore/ffndev"
  project      = var.project
  ruleset_name = "projects/${var.project}/rulesets/${google_firebaserules_ruleset.dev.name}"
}

resource "google_firebaserules_ruleset" "dev" {
  project = var.project

  source {
    files {
      content = file("../firebase/dev/firestore.rules")
      name    = "firestore.rules"
    }
  }
}

locals {
  firestore_index_replace_regex = "/([\"{}: ,\\[\\]]|fieldPath|order)+/"
  firestore_index_file_dev      = jsondecode(file("../firebase/dev/firestore.indexes.json"))
  firestore_indexes_dev = {
    for index in local.firestore_index_file_dev.indexes : "${index.collectionGroup}-${index.queryScope}-${replace(jsonencode(index.fields), local.firestore_index_replace_regex, "-")}" => index
  }
}

resource "google_firestore_database" "dev" {
  project                           = var.project
  name                              = "ffndev"
  location_id                       = "eur3"
  type                              = "FIRESTORE_NATIVE"
  point_in_time_recovery_enablement = "POINT_IN_TIME_RECOVERY_ENABLED"
  # delete_protection_state = "DELETE_PROTECTION_DISABLED"
  # deletion_policy         = "DELETE"
}

# resource "google_firestore_index" "dev" {
#   project    = var.project
#   database   = google_firestore_database.dev.name
#   for_each   = local.firestore_indexes_dev
#   collection = each.value.collectionGroup


#   query_scope = each.value.queryScope
#   # api_scope   = "DATASTORE_MODE_API"

#   dynamic "fields" {
#     for_each = each.value.fields
#     content {
#       field_path = fields.value.fieldPath
#       order      = try(fields.value.order, "ASCENDING")
#     }
#   }

# }
