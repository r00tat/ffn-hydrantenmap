variable "project" {
  description = "GCP project the job runs in"
  type        = string
}

variable "run_region" {
  description = "Region of the Cloud Scheduler job and of the Cloud Run service"
  type        = string
}

variable "service_name" {
  description = "Name of the Cloud Run service that gets called"
  type        = string
}

# Dev und Prod laufen im selben GCP-Projekt (ffn-utils). Service-Account-Namen
# sind projektweit eindeutig, Scheduler-Job-Namen je Projekt und Region — ohne
# Unterscheidung legen beide Roots dieselben Ressourcen an und der zweite `apply`
# scheitert mit 409.
variable "name_suffix" {
  description = "Suffix for the invoker service account and the job name, so that two environments can share a project. Empty in prod, \"-dev\" in dev."
  type        = string
  default     = ""

  validation {
    # Die account_id des Invoker-SA ist "fahrtenbuch-report-invoker" (26
    # Zeichen) plus Suffix, und account_id darf höchstens 30 Zeichen haben.
    condition     = length(var.name_suffix) <= 4
    error_message = "name_suffix darf höchstens 4 Zeichen lang sein, sonst überschreitet die account_id des Invoker-Service-Accounts die 30-Zeichen-Grenze."
  }

  validation {
    condition     = can(regex("^(-[a-z0-9]+)?$", var.name_suffix))
    error_message = "name_suffix muss leer sein oder mit einem Bindestrich beginnen und darf nur Kleinbuchstaben und Ziffern enthalten."
  }
}

# Bewusst die Custom Domain und nicht `module.cloud_run.uri`: Der Dienst ist
# öffentlich unter einsatz(-dev).ffnd.at erreichbar, und `getBaseUrl()` leitet
# die erwartete Audience aus dem Host des Requests ab. Ein Token auf die
# run.app-URL passte nicht dazu.
variable "service_url" {
  description = "Public base URL of the service, e.g. https://karte.example.at"
  type        = string
}

variable "weekly_report_schedule" {
  description = "Cron expression of the Fahrtenbuch weekly report"
  type        = string
  default     = "0 7 * * 1"
}

variable "weekly_report_paused" {
  description = "Job exists but does not run. Default in dev, so that two environments never mail the same distribution list."
  type        = bool
  default     = false
}

variable "ueberwachung_schedule" {
  description = "Cron expression of the breathing apparatus monitoring sweep. This is the safety net under the Cloud Tasks schedule, not the primary path — see docs/atemschutzueberwachung.md."
  type        = string
  default     = "*/10 * * * *"
}

variable "tasks_queue_name" {
  description = "Name of the Cloud Tasks queue holding the breathing apparatus warning schedule. Must match ATEMSCHUTZ_TASKS_QUEUE in the service env — the caller builds both from the same local."
  type        = string
}

variable "caller_service_account_email" {
  description = "Runtime service account of the Cloud Run service. It enqueues the tasks, so it needs cloudtasks.enqueuer on the queue and serviceAccountUser on the invoker."
  type        = string
}

variable "ueberwachung_paused" {
  description = "Job exists but does not run. Default off in both environments: dev and prod use separate Firestore databases, and the push only reaches the devices working on that very monitoring."
  type        = bool
  default     = false
}

# Cloud Tasks hängt in einem Projekt mit App-Engine-Anwendung an deren Region:
# ffn-utils hat eine in europe-west1, der Dienst läuft in europe-west4, und ein
# `location = europe-west4` scheitert deshalb mit „Location 'europe-west4' is
# not a valid location". Die Region der Queue ist frei wählbar gegenüber dem
# Ziel des Aufrufs — Cloud Tasks ruft eine beliebige HTTPS-URL auf.
variable "tasks_region" {
  description = "Region of the Cloud Tasks queue. Pinned to the App Engine region of the project (europe-west1), not the Cloud Run region. Must match the region in ATEMSCHUTZ_TASKS_QUEUE — the caller builds both from the same variable."
  type        = string
}
