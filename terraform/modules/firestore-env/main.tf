locals {
  # ==========================================================================
  # WICHTIG: firestore_index_replace_regex und die beiden for-Ausdrücke sind
  # zeichengleich aus dem früheren terraform/firebase.tf übernommen. Sie
  # bilden die for_each-Keys der Index- und Field-Ressourcen. Jede Änderung —
  # auch eine rein kosmetische — ändert die Keys und führt beim nächsten
  # apply zu Destroy+Create auf produktiven Firestore-Indexes.
  # ==========================================================================
  firestore_index_replace_regex = "/([\"{}: ,\\[\\]]|fieldPath|order)+/"

  firestore_index_file = jsondecode(file(var.indexes_file))

  firestore_indexes = {
    for index in local.firestore_index_file.indexes :
    "${index.collectionGroup}-${index.queryScope}-${replace(jsonencode(index.fields), local.firestore_index_replace_regex, "-")}" => index
  }

  firestore_field_overrides = {
    for fo in try(local.firestore_index_file.fieldOverrides, []) :
    "${fo.collectionGroup}-${fo.fieldPath}" => fo
  }

  # '(default)' hat kein Datenbank-Suffix im Release-Namen.
  release_name = var.database_name == "(default)" ? "cloud.firestore" : "cloud.firestore/${var.database_name}"

  # Beim Erstellen zeigt die Referenz auf die neue Datenbank, sonst auf den
  # übergebenen Namen — so hängen Indexes in beiden Fällen korrekt ab.
  database = var.create_database ? google_firestore_database.this[0].name : var.database_name
}

resource "google_firestore_database" "this" {
  count                             = var.create_database ? 1 : 0
  project                           = var.project
  name                              = var.database_name
  location_id                       = var.location_id
  type                              = "FIRESTORE_NATIVE"
  point_in_time_recovery_enablement = var.point_in_time_recovery_enablement
}

# ============================================================================
# Firestore Rules
# ============================================================================

resource "google_firebaserules_ruleset" "this" {
  project = var.project

  source {
    files {
      content = file(var.rules_file)
      name    = "firestore.rules"
    }
  }
}

resource "google_firebaserules_release" "this" {
  name         = local.release_name
  project      = var.project
  ruleset_name = "projects/${var.project}/rulesets/${google_firebaserules_ruleset.this.name}"
}

# ============================================================================
# Firestore Indexes
# ============================================================================

resource "google_firestore_index" "this" {
  for_each   = local.firestore_indexes
  project    = var.project
  database   = local.database
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

resource "google_firestore_field" "this" {
  for_each   = local.firestore_field_overrides
  project    = var.project
  database   = local.database
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
