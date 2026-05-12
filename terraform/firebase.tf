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

# ============================================================================
# Storage Rules
# ============================================================================

resource "google_firebaserules_ruleset" "storage" {
  project = var.project

  source {
    files {
      content = file("../storage.rules")
      name    = "storage.rules"
    }
  }
}

resource "google_firebaserules_release" "storage" {
  name         = "firebase.storage/${var.project}.appspot.com"
  project      = var.project
  ruleset_name = "projects/${var.project}/rulesets/${google_firebaserules_ruleset.storage.name}"
}

# ============================================================================
# Firestore Index Locals
# ============================================================================

locals {
  firestore_index_replace_regex = "/([\"{}: ,\\[\\]]|fieldPath|order)+/"

  # Dev database indexes
  firestore_index_file_dev = jsondecode(file("../firebase/dev/firestore.indexes.json"))
  firestore_indexes_dev = {
    for index in local.firestore_index_file_dev.indexes :
    "${index.collectionGroup}-${index.queryScope}-${replace(jsonencode(index.fields), local.firestore_index_replace_regex, "-")}" => index
  }
  firestore_field_overrides_dev = {
    for fo in try(local.firestore_index_file_dev.fieldOverrides, []) :
    "${fo.collectionGroup}-${fo.fieldPath}" => fo
  }

  # Prod database indexes
  firestore_index_file_prod = jsondecode(file("../firebase/prod/firestore.indexes.json"))
  firestore_indexes_prod = {
    for index in local.firestore_index_file_prod.indexes :
    "${index.collectionGroup}-${index.queryScope}-${replace(jsonencode(index.fields), local.firestore_index_replace_regex, "-")}" => index
  }
  firestore_field_overrides_prod = {
    for fo in try(local.firestore_index_file_prod.fieldOverrides, []) :
    "${fo.collectionGroup}-${fo.fieldPath}" => fo
  }
}


# ============================================================================
# Dev Firestore Database + Indexes
# ============================================================================

resource "google_firestore_database" "dev" {
  project                           = var.project
  name                              = "ffndev"
  location_id                       = "eur3"
  type                              = "FIRESTORE_NATIVE"
  point_in_time_recovery_enablement = "POINT_IN_TIME_RECOVERY_ENABLED"
}

resource "google_firestore_index" "dev" {
  for_each   = local.firestore_indexes_dev
  project    = var.project
  database   = google_firestore_database.dev.name
  collection = each.value.collectionGroup

  query_scope = each.value.queryScope

  dynamic "fields" {
    for_each = each.value.fields
    content {
      field_path = fields.value.fieldPath
      order      = try(fields.value.order, "ASCENDING")
    }
  }
}

resource "google_firestore_field" "dev" {
  for_each   = local.firestore_field_overrides_dev
  project    = var.project
  database   = google_firestore_database.dev.name
  collection = each.value.collectionGroup
  field      = each.value.fieldPath

  index_config {
    dynamic "indexes" {
      for_each = each.value.indexes
      content {
        order        = try(indexes.value.order, null)
        array_config = try(indexes.value.arrayConfig, null)
        query_scope  = try(indexes.value.queryScope, "COLLECTION")
      }
    }
  }
}

# ============================================================================
# Prod Firestore Indexes (default database)
# ============================================================================

resource "google_firestore_index" "prod" {
  for_each   = local.firestore_indexes_prod
  project    = var.project
  database   = "(default)"
  collection = each.value.collectionGroup

  query_scope = each.value.queryScope

  dynamic "fields" {
    for_each = each.value.fields
    content {
      field_path = fields.value.fieldPath
      order      = try(fields.value.order, "ASCENDING")
    }
  }
}

resource "google_firestore_field" "prod" {
  for_each   = local.firestore_field_overrides_prod
  project    = var.project
  database   = "(default)"
  collection = each.value.collectionGroup
  field      = each.value.fieldPath

  index_config {
    dynamic "indexes" {
      for_each = each.value.indexes
      content {
        order        = try(indexes.value.order, null)
        array_config = try(indexes.value.arrayConfig, null)
        query_scope  = try(indexes.value.queryScope, "COLLECTION")
      }
    }
  }
}
