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


# Die Warteschlange für die Termine der Atemschutzüberwachung.
#
# Sie ist der **Hauptweg** der Warnungen: Sobald ein Trupp abmarschiert ist,
# stehen Drittel, zwei Drittel und der Rückzugszeitpunkt fest, und die App legt
# eine Aufgabe auf genau diesen Zeitpunkt. Vorher sah ein Zeitplan jede Minute
# nach und fand fast immer nichts — rund 44.000 Läufe im Monat für ein paar
# Warnungen im Jahr.
#
# Die Queue liegt im Modul „cloud-scheduler", obwohl sie kein Scheduler ist:
# Beide rufen denselben Endpoint mit dem OIDC-Token *desselben* Service Accounts
# auf, und der steht hier samt seiner run.invoker-Bindung. Ein eigenes Modul
# müsste ihn übergeben oder duplizieren.
resource "google_cloud_tasks_queue" "atemschutz_ueberwachung" {
  project  = var.project
  name     = var.tasks_queue_name
  location = var.run_region

  rate_limits {
    # Die Aufgaben stehen zeitlich weit auseinander; die Grenzen sind Riegel
    # gegen einen Fehler in der Planung, nicht Steuerung des Normalbetriebs.
    max_dispatches_per_second = 10
    max_concurrent_dispatches = 10
  }

  retry_config {
    # Wiederholen ist hier billig und richtig: Der Endpoint ist idempotent (er
    # vermerkt jede verschickte Warnung am Dokument) und ein 500 wegen eines
    # kalten Starts darf keine Sicherheitswarnung verschlucken.
    max_attempts       = 5
    min_backoff        = "10s"
    max_backoff        = "60s"
    max_retry_duration = "600s"
  }
}

# Der Dienst legt die Aufgaben selbst an — dafür braucht sein Laufzeit-Konto
# das Recht an der Queue …
resource "google_cloud_tasks_queue_iam_member" "enqueuer" {
  project  = var.project
  location = google_cloud_tasks_queue.atemschutz_ueberwachung.location
  name     = google_cloud_tasks_queue.atemschutz_ueberwachung.name
  role     = "roles/cloudtasks.enqueuer"
  member   = "serviceAccount:${var.caller_service_account_email}"
}

# … und das Recht, dem Aufruf das OIDC-Token des Invokers mitzugeben. Ohne
# `serviceAccountUser` lehnt Cloud Tasks das Anlegen mit PERMISSION_DENIED ab,
# obwohl das Recht an der Queue stimmt.
resource "google_service_account_iam_member" "enqueuer_acts_as_invoker" {
  service_account_id = google_service_account.fahrtenbuch_report_invoker.name
  role               = "roles/iam.serviceAccountUser"
  member             = "serviceAccount:${var.caller_service_account_email}"
}

# Die Fristenprüfung der Atemschutzüberwachung — als **Netz** unter der
# Terminplanung, nicht als Hauptweg.
#
# Warum es den Zeitplan weiterhin gibt: Die Aufgabe entsteht in dem Moment, in
# dem der Browser den Abmarsch schreibt. Bricht der Aufruf danach ab — Funkloch,
# App geschlossen, ein Fehler in der Queue —, wartet niemand mehr. Der Lauf
# durchsucht alle Trupps mit Zustand `imEinsatz`, verschickt Fälliges und plant
# die fehlende Aufgabe nach; er repariert also genau diesen Fall.
#
# Alle zehn Minuten und nicht jede Minute: Für den Hauptweg zählt die Minute
# nicht mehr, weil die Aufgabe auf die Sekunde liegt. Als Netz reichen zehn
# Minuten — und aus 44.000 Läufen im Monat werden 4.400.
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
