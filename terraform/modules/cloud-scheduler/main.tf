locals {
  # Muss zu CRON_INVOKER_EMAILS in .github/workflows/cloud-run.yml passen — sonst
  # weist cronRequired den Aufrufer ab, obwohl Token und Berechtigung stimmen.
  invoker_account_id = "fahrtenbuch-report-invoker${var.name_suffix}"
}

resource "google_service_account" "fahrtenbuch_report_invoker" {
  project      = var.project
  account_id   = local.invoker_account_id
  display_name = "Cloud Scheduler — Fahrtenbuch-Wochenbericht${var.name_suffix}"
  description  = "Ruft den Wochenbericht-Endpoint mit einem OIDC-Token auf"
}

# Der Dienst selbst wird außerhalb von terraform per `gcloud run deploy` angelegt
# (.github/workflows/cloud-run.yml). Die v1-Ressource setzt die Policy auf
# demselben Dienst-Objekt wie `google_cloud_run_v2_service_iam_member` und
# braucht kein von terraform verwaltetes Service-Objekt.
resource "google_cloud_run_service_iam_member" "invoker" {
  project  = var.project
  location = var.run_region
  service  = var.service_name
  role     = "roles/run.invoker"
  member   = "serviceAccount:${google_service_account.fahrtenbuch_report_invoker.email}"
}

resource "google_cloud_scheduler_job" "fahrtenbuch_weekly_report" {
  project     = var.project
  region      = var.run_region
  name        = "fahrtenbuch-weekly-report${var.name_suffix}"
  description = "Wochenbericht des Fahrtenbuchs je Gruppe"
  schedule    = var.weekly_report_schedule
  time_zone   = "Europe/Vienna"
  paused      = var.weekly_report_paused

  # Wenige Versuche: Der Endpoint antwortet bei Teilerfolg mit 200, eine
  # Wiederholung greift also nur, wenn keine Gruppe eine Mail bekommen hat.
  # Mehr Versuche würden im Fehlerfall nichts retten und im Teilerfolg nichts
  # ausrichten.
  retry_config {
    retry_count = 2
  }

  http_target {
    http_method = "POST"
    uri         = "${var.service_url}/api/fahrtenbuch/weekly-report"

    headers = {
      "Content-Type" = "application/json"
    }

    # Leerer Body: Der Endpoint nimmt ohne Angabe die letzte abgeschlossene
    # ISO-Woche. Die Wochenrechnung gehört in die App, wo sie getestet ist, und
    # nicht in eine Scheduler-Payload.
    body = base64encode("{}")

    oidc_token {
      service_account_email = google_service_account.fahrtenbuch_report_invoker.email
      audience              = var.service_url
    }
  }
}

# Nur zur Kontrolle und für den `dryRun`-Aufruf von Hand. Die Allowlist
# CRON_INVOKER_EMAILS wird nicht aus diesem Output gespeist, sondern beim Deploy
# aus denselben Namen abgeleitet (.github/workflows/cloud-run.yml) — das Deploy
# soll nicht davon abhängen, dass dieses Modul schon appliziert wurde.
output "invoker_service_account_email" {
  description = "Service account the Cloud Scheduler job authenticates as"
  value       = google_service_account.fahrtenbuch_report_invoker.email
}
