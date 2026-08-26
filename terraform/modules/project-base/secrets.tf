# ============================================================================
# Secret Manager
#
# Terraform verwaltet nur die Hüllen, nicht die Werte. Ausnahme ist der
# BlaulichtSMS-Encryption-Key weiter unten.
#
# Die Cron-Invoker-Allowlist steht bewusst nicht hier: Sie ist eine Kennung, kein
# Geheimnis, und als Secret hinge jedes Deploy an einem vorherigen apply dieses
# Moduls. Sie wird beim Deploy als Env-Var gesetzt, siehe
# .github/workflows/cloud-run.yml.
# ============================================================================

resource "google_secret_manager_secret" "secrets" {
  for_each  = var.secrets
  secret_id = each.value
  project   = var.project

  replication {
    auto {}
  }
}

resource "google_secret_manager_secret_iam_member" "secret_access" {
  for_each  = var.secrets
  secret_id = google_secret_manager_secret.secrets[each.key].id
  role      = "roles/secretmanager.secretAccessor"
  member    = google_service_account.run_sa.member
}

# ============================================================================
# BlaulichtSMS Encryption Key
# ============================================================================

resource "random_id" "blaulichtsms_encryption_key" {
  byte_length = 32
}

resource "google_secret_manager_secret" "blaulichtsms_encryption_key" {
  secret_id = "BLAULICHTSMS_ENCRYPTION_KEY"
  project   = var.project

  replication {
    auto {}
  }
}

resource "google_secret_manager_secret_version" "blaulichtsms_encryption_key" {
  secret      = google_secret_manager_secret.blaulichtsms_encryption_key.id
  secret_data = random_id.blaulichtsms_encryption_key.hex

  lifecycle {
    ignore_changes = [secret_data]
  }
}

resource "google_secret_manager_secret_iam_member" "blaulichtsms_encryption_key_access" {
  secret_id = google_secret_manager_secret.blaulichtsms_encryption_key.id
  role      = "roles/secretmanager.secretAccessor"
  member    = google_service_account.run_sa.member
}

# ============================================================================
# MCP OAuth Signing Key
#
# RS256-Schlüsselpaar des Authorization Servers. Terraform erzeugt es, weil es
# — anders als die Zugangsdaten weiter oben — kein Wert von außen ist: Es gibt
# keine Stelle, von der man ihn abschreiben könnte.
#
# `ignore_changes` auf `secret_data`: Eine Rotation wird bewusst von Hand
# ausgelöst (neue Secret-Version anlegen und neu deployen), nicht bei jedem
# apply. Der `kid` im JWT ist der Thumbprint des Schlüssels und ändert sich
# dabei von selbst — bereits ausgestellte Tokens werden ungültig, das ist der
# Zweck einer Rotation.
# ============================================================================

resource "tls_private_key" "mcp_oauth_signing_key" {
  algorithm = "RSA"
  rsa_bits  = 2048
}

resource "google_secret_manager_secret" "mcp_oauth_signing_key" {
  secret_id = "MCP_OAUTH_SIGNING_KEY"
  project   = var.project

  replication {
    auto {}
  }
}

resource "google_secret_manager_secret_version" "mcp_oauth_signing_key" {
  secret = google_secret_manager_secret.mcp_oauth_signing_key.id
  # PKCS#8, weil `importPKCS8` aus jose genau das erwartet.
  secret_data = tls_private_key.mcp_oauth_signing_key.private_key_pem_pkcs8

  lifecycle {
    ignore_changes = [secret_data]
  }
}

resource "google_secret_manager_secret_iam_member" "mcp_oauth_signing_key_access" {
  secret_id = google_secret_manager_secret.mcp_oauth_signing_key.id
  role      = "roles/secretmanager.secretAccessor"
  member    = google_service_account.run_sa.member
}
