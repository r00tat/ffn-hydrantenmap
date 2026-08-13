# ============================================================================
# Secret Manager
#
# Terraform verwaltet nur die Hüllen, nicht die Werte — für Werte, die es nicht
# kennen kann (API-Keys, Zugangsdaten). Ausnahmen weiter unten sind der
# BlaulichtSMS-Encryption-Key und die Cron-Invoker-Allowlist: die erzeugt
# terraform selbst, deshalb schreibt es auch die Version.
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
# Cron-Invoker-Allowlist
#
# Die Adressen stammen aus terraform selbst (siehe modules/cloud-scheduler),
# deshalb schreibt terraform hier auch die Version. Kein `ignore_changes`: kommt
# eine Umgebung dazu oder ändert sich ein Name, soll der nächste apply die
# Allowlist mitziehen.
# ============================================================================

resource "google_secret_manager_secret" "cron_invoker_emails" {
  secret_id = "CRON_INVOKER_EMAILS"
  project   = var.project

  replication {
    auto {}
  }
}

resource "google_secret_manager_secret_version" "cron_invoker_emails" {
  # Ohne Adressen keine Version: eine leere Allowlist würde von cronRequired wie
  # „nicht konfiguriert" behandelt, und eine Hülle ohne Version macht dasselbe —
  # nur ohne eine Version, die später mühsam deaktiviert werden müsste.
  count = length(var.cron_invoker_emails) > 0 ? 1 : 0

  secret      = google_secret_manager_secret.cron_invoker_emails.id
  secret_data = join(",", var.cron_invoker_emails)
}

resource "google_secret_manager_secret_iam_member" "cron_invoker_emails_access" {
  secret_id = google_secret_manager_secret.cron_invoker_emails.id
  role      = "roles/secretmanager.secretAccessor"
  member    = google_service_account.run_sa.member
}
