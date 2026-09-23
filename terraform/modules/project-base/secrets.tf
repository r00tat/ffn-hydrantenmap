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

# ============================================================================
# Gemini Live API Key
#
# Eigener API-Key für die Live-API der Gemini Developer API, streng getrennt
# vom öffentlichen Browser-Key des Firebase-Projekts. Er prägt serverseitig die
# kurzlebigen Tokens der Sprach-Sitzung und verlässt den Server nie — im
# Browser liegt nur das Token. Siehe docs/api-keys.md.
#
# Warum dieser Key — anders als die beiden Firebase-Keys — in terraform steht:
# Das Killer-Argument dort ist, dass ein destroy/create einen neuen Key-String
# vergibt und damit jedes ausgelieferte Bundle und jede google-services.json
# entwertet. Dieser Key steckt in keinem Artefakt, sondern ausschließlich im
# Secret Manager; ein neuer String kostet hier ein Redeploy, keinen Ausfall.
#
# Der Key-String landet damit im terraform-State (var.state_bucket). Das ist
# die bewusst in Kauf genommene Seite der Abwägung: Wer den State lesen kann,
# ist ohnehin Projekt-Administrator.
#
# Die `restrictions`: ausschließlich eine API-Restriction auf den einen Dienst,
# **keine** Application-Restriction. Ein Referrer würde hier nichts schützen —
# der Aufruf kommt vom Server und schickt keinen.
# ============================================================================

resource "google_apikeys_key" "gemini_live" {
  name         = "gemini-live"
  display_name = "Gemini Live (server only)"
  project      = var.project

  restrictions {
    api_targets {
      service = "generativelanguage.googleapis.com"
    }
  }

  # Ohne aktivierte API-Keys-API scheitert das erste apply mit 403. terraform
  # leitet die Abhängigkeit nicht selbst ab, weil die Ressource den Dienst
  # nicht referenziert.
  depends_on = [google_project_service.apis]
}

resource "google_secret_manager_secret" "gemini_live_api_key" {
  secret_id = "GEMINI_LIVE_API_KEY"
  project   = var.project

  replication {
    auto {}
  }
}

resource "google_secret_manager_secret_version" "gemini_live_api_key" {
  secret = google_secret_manager_secret.gemini_live_api_key.id
  # Hier bewusst **kein** `ignore_changes` wie bei den beiden Schlüsseln
  # darüber: Deren Wert erzeugt terraform aus dem Nichts, eine Rotation ist
  # eine Entscheidung. Dieser Wert gehört einer echten Ressource — wird der
  # Key neu vergeben, muss das Secret nachziehen, sonst zeigt der Dienst auf
  # einen Key, den es nicht mehr gibt.
  secret_data = google_apikeys_key.gemini_live.key_string
}

resource "google_secret_manager_secret_iam_member" "gemini_live_api_key_access" {
  secret_id = google_secret_manager_secret.gemini_live_api_key.id
  role      = "roles/secretmanager.secretAccessor"
  member    = google_service_account.run_sa.member
}
