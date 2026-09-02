locals {
  # Muss zu `local.cron_invoker_emails` im aufrufenden Root passen — sonst weist
  # cronRequired den Aufrufer ab, obwohl Token und Berechtigung stimmen. Dort
  # prüft ein `check`-Block genau diese Übereinstimmung.
  #
  # Der Name nennt das Fahrtenbuch, obwohl inzwischen auch die
  # Atemschutzüberwachung darüber läuft: Eine account_id lässt sich nicht
  # umbenennen, ein neuer Service Account hieße ein neuer Eintrag in
  # CRON_INVOKER_EMAILS und damit ein Deploy, das genau zwischen apply und
  # Rollout jeden Zeitplan ablehnt. Der Name ist historisch, die Rolle ist
  # „Aufrufer der geplanten Läufe".
  invoker_account_id = "fahrtenbuch-report-invoker${var.name_suffix}"
}

resource "google_service_account" "fahrtenbuch_report_invoker" {
  project      = var.project
  account_id   = local.invoker_account_id
  display_name = "Cloud Scheduler — Fahrtenbuch-Wochenbericht${var.name_suffix}"
  description  = "Ruft den Wochenbericht-Endpoint mit einem OIDC-Token auf"
}

# Die v1-Ressource setzt die Policy auf demselben Dienst-Objekt wie
# `google_cloud_run_v2_service_iam_member` in modules/cloud-run und nimmt den
# Dienstnamen als Zeichenkette — das Modul braucht deshalb keine Referenz auf
# die Service-Ressource.
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


# Die Fristenprüfung der Atemschutzüberwachung.
#
# Jede Minute, und das ist der Punkt: Die Drittelmarken eines
# Standard-Pressluftatmers liegen bei rund acht Minuten, die Rückzugswarnung
# hat drei Minuten Vorlauf. Ein Lauf alle fünf Minuten könnte die Vorwarnung um
# zwei Minuten verpassen — genau die Zeit, um die es bei einer
# Sicherheitsfunktion geht. Der Lauf ist billig: Er liest die Trupps mit Zustand
# `imEinsatz`, und das sind außerhalb eines Einsatzes null Dokumente.
#
# Anders als der Wochenbericht **nicht** pausierbar in dev: Der Push geht an die
# Geräte, die an der jeweiligen Überwachung arbeiten, und dev und prod lesen
# getrennte Firestore-Datenbanken. Zwei Umgebungen können sich hier also nicht
# in die Quere kommen — im Gegensatz zur gemeinsamen Verteilerliste der Mails.
resource "google_cloud_scheduler_job" "atemschutz_ueberwachung" {
  project     = var.project
  region      = var.run_region
  name        = "atemschutz-ueberwachung${var.name_suffix}"
  description = "Fristen der Atemschutzüberwachung prüfen und warnen"
  schedule    = var.ueberwachung_schedule
  time_zone   = "Europe/Vienna"
  paused      = var.ueberwachung_paused

  # Keine Wiederholung: Der nächste Lauf kommt in einer Minute ohnehin, und eine
  # verschickte Warnung ist am Dokument vermerkt — ein Wiederholungsversuch
  # könnte also nur dieselbe Prüfung doppelt machen.
  retry_config {
    retry_count = 0
  }

  http_target {
    http_method = "POST"
    uri         = "${var.service_url}/api/atemschutz/ueberwachung-check"

    headers = {
      "Content-Type" = "application/json"
    }

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
